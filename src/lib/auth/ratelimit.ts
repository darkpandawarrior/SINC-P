/**
 * Rate limiting for login and password reset.
 *
 * Fixed window, keyed per-IP and per-account, both checked on every attempt so a
 * script hammering one account from many IPs and a script spraying many accounts from
 * one IP are both caught.
 *
 * // ponytail: in-memory limiter, move to Redis when we run more than one instance —
 * each process has its own counters, so a second app instance behind a load balancer
 * would let an attacker double their attempt budget by round-robining. Fine for the
 * single-instance Docker Compose target in the ADR; not fine the day there's a second
 * `app` container.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

const WINDOW_MS = 15 * 60 * 1000

function hit(key: string, limit: number): boolean {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (existing.count >= limit) return false
  existing.count += 1
  return true
}

// No setInterval sweep on purpose — a timer would keep the process (and every test file
// that imports this module) alive for no benefit. Sweep lazily, and only bother once the
// map has grown enough that an attacker is plausibly the reason.
function sweepExpired(): void {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}
const SWEEP_THRESHOLD = 10_000

/** Generous per-IP ceiling (scripted credential stuffing across many accounts) and a
 *  tight per-account ceiling (guessing one student's password). Both counters always
 *  increment, even once one side has already failed, so the accounting stays honest. */
export function checkLoginRateLimit(ip: string, email: string): boolean {
  if (buckets.size > SWEEP_THRESHOLD) sweepExpired()
  const ipOk = hit(`login:ip:${ip}`, 30)
  const acctOk = hit(`login:acct:${email.toLowerCase()}`, 5)
  return ipOk && acctOk
}

/** `key` is the account email for a reset *request*, or the token's hash for a reset
 *  *submission* — either way it is something an attacker cannot cheaply rotate to dodge
 *  the per-account bucket. */
export function checkResetRateLimit(ip: string, key: string): boolean {
  if (buckets.size > SWEEP_THRESHOLD) sweepExpired()
  const ipOk = hit(`reset:ip:${ip}`, 20)
  const acctOk = hit(`reset:acct:${key.toLowerCase()}`, 5)
  return ipOk && acctOk
}

/** Test-only escape hatch — the module-level Map otherwise leaks state between tests. */
export function __resetRateLimitStateForTests(): void {
  buckets.clear()
}
