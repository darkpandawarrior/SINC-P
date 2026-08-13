/**
 * Rate limiting for login and password reset.
 *
 * Fixed window, keyed per-IP and per-account, both checked on every attempt so a script
 * hammering one account from many IPs and a script spraying many accounts from one IP
 * are both caught.
 *
 * Two stores ship, because two genuinely different deployments exist:
 *
 *   memory    (default) one process, one Map. Correct for the single-container Docker
 *             Compose target, and it costs nothing.
 *   postgres  shared counters, for the day a second app container appears behind a load
 *             balancer. Without it, round-robining two instances doubles an attacker's
 *             attempt budget.
 *
 * Postgres rather than Redis on purpose. Redis would be a second piece of infrastructure
 * for a college IT admin to install, monitor and fail to restart, and the deployment
 * story is already the second most likely way this product dies (ADR-0001 Q4). Postgres
 * is a hard dependency that is already running, and a rate-limit check is one indexed
 * upsert against a table with a handful of rows. If throughput ever makes that the
 * bottleneck, swap this store; the callers will not notice.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

const WINDOW_MS = 15 * 60 * 1000

export interface RateLimitStore {
  name: string
  /** True when the caller is still within its budget. Always counts the attempt. */
  hit(key: string, limit: number, windowMs: number): Promise<boolean>
  reset(): Promise<void>
}

// ---------------------------------------------------------------------------
// memory
// ---------------------------------------------------------------------------

interface Bucket {
  count: number
  resetAt: number
}

const SWEEP_THRESHOLD = 10_000

function memoryStore(): RateLimitStore {
  const buckets = new Map<string, Bucket>()

  // No setInterval sweep on purpose: a timer keeps the process (and every test file that
  // imports this module) alive for no benefit. Sweep lazily, once the map has grown
  // enough that an attacker is plausibly the reason.
  function sweepExpired(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  return {
    name: 'memory',
    async hit(key, limit, windowMs) {
      const now = Date.now()
      if (buckets.size > SWEEP_THRESHOLD) sweepExpired(now)

      const existing = buckets.get(key)
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }
      if (existing.count >= limit) return false
      existing.count += 1
      return true
    },
    async reset() {
      buckets.clear()
    },
  }
}

// ---------------------------------------------------------------------------
// postgres
// ---------------------------------------------------------------------------

function postgresStore(): RateLimitStore {
  return {
    name: 'postgres',
    async hit(key, limit, windowMs) {
      // One statement, so two instances racing the same key cannot both read a stale
      // count and both decide they are under the limit. The row is reset in the same
      // upsert when its window has already expired, which avoids a separate sweep job.
      const rows = await db.execute<{ count: number }>(sql`
        INSERT INTO rate_limits (key, count, reset_at)
        VALUES (${key}, 1, now() + ${`${windowMs} milliseconds`}::interval)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE
            WHEN rate_limits.reset_at <= now() THEN 1
            ELSE rate_limits.count + 1
          END,
          reset_at = CASE
            WHEN rate_limits.reset_at <= now()
              THEN now() + ${`${windowMs} milliseconds`}::interval
            ELSE rate_limits.reset_at
          END
        RETURNING count
      `)
      const count = Number(rows.rows[0]?.count ?? 1)
      return count <= limit
    },
    async reset() {
      await db.execute(sql`DELETE FROM rate_limits`)
    },
  }
}

// ---------------------------------------------------------------------------

let store: RateLimitStore | undefined

export function getRateLimitStore(): RateLimitStore {
  if (!store) {
    store = process.env.RATE_LIMIT_STORE === 'postgres' ? postgresStore() : memoryStore()
  }
  return store
}

/**
 * Generous per-IP ceiling (scripted credential stuffing across many accounts) and a
 * tight per-account ceiling (guessing one student's password). Both counters always
 * increment, even once one side has already failed, so the accounting stays honest.
 */
export async function checkLoginRateLimit(ip: string, email: string): Promise<boolean> {
  const s = getRateLimitStore()
  const [ipOk, acctOk] = await Promise.all([
    s.hit(`login:ip:${ip}`, 30, WINDOW_MS),
    s.hit(`login:acct:${email.toLowerCase()}`, 5, WINDOW_MS),
  ])
  return ipOk && acctOk
}

/**
 * `key` is the account email for a reset *request*, or the token's hash for a reset
 * *submission*. Either way it is something an attacker cannot cheaply rotate to dodge
 * the per-account bucket.
 */
export async function checkResetRateLimit(ip: string, key: string): Promise<boolean> {
  const s = getRateLimitStore()
  const [ipOk, acctOk] = await Promise.all([
    s.hit(`reset:ip:${ip}`, 20, WINDOW_MS),
    s.hit(`reset:acct:${key.toLowerCase()}`, 5, WINDOW_MS),
  ])
  return ipOk && acctOk
}

/** Test-only escape hatch. Module-level state otherwise leaks between test files. */
export async function __resetRateLimitStateForTests(): Promise<void> {
  await getRateLimitStore().reset()
}

/** Test-only: exercise the postgres store without setting an env var process-wide. */
export function __setRateLimitStoreForTests(s: RateLimitStore | undefined): void {
  store = s
}

export const __stores = { memoryStore, postgresStore, WINDOW_MS }
