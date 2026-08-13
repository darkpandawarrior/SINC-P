/**
 * Database access, and the one place tenancy is enforced.
 *
 * Every query that touches tenant data must go through `withTenant`. It opens a
 * transaction, sets the Postgres session variable `app.institution_id`, and the RLS
 * policies in drizzle/0001_rls.sql do the rest. Forgetting a `WHERE institutionId = ?`
 * in application code then returns zero rows instead of another college's data.
 *
 * This is belt and braces on purpose. Application-level scoping alone fails the first
 * time someone writes a raw query; RLS alone fails if a policy is dropped. Both is
 * cheap, and cross-tenant leakage is the one bug that ends a B2B SaaS.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL is required in production')
}

export const pool = new Pool({
  connectionString: connectionString ?? 'postgres://sincp:sincp@localhost:5432/sincp',
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })

export type Db = typeof db
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Run `fn` inside a transaction scoped to one institution.
 *
 * `set_config(..., true)` makes the setting transaction-local, so a pooled connection
 * handed to the next request does not inherit the previous tenant. That `true` is
 * load-bearing — with `false` this function would be a cross-tenant leak generator.
 */
export async function withTenant<T>(institutionId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Defence against a caller that interpolates user input. RLS would still hold, but
  // a malformed value should fail loudly here rather than silently match nothing.
  if (!UUID_RE.test(institutionId)) {
    throw new Error('withTenant: institutionId must be a UUID')
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${institutionId}, true)`)
    return fn(tx)
  })
}

/**
 * Cross-tenant work runs as a different database role, on its own pool.
 *
 * This used to flip a `app.bypass_rls` setting on the normal connection. That was wrong
 * and a live test proved it: the application role could set that variable itself and
 * read every institution, so a single SQL-execution bug would have switched tenant
 * isolation off entirely. Bypass is now a property of the role you connect as, which
 * sincp_app cannot grant itself.
 *
 * Use only where a tenant genuinely is not known yet: the login lookup, signup, and
 * platform reporting. Callers must scope by hand — nothing is filtering for them here.
 */
// Mirrors the main pool: a local default for dev and tests, but required in production,
// where silently falling back to a guessed connection string would be much worse than
// failing to boot.
const adminConnectionString =
  process.env.DATABASE_ADMIN_URL ??
  (process.env.NODE_ENV === 'production'
    ? undefined
    : 'postgres://sincp_admin:sincp_admin_dev_only@localhost:5432/sincp')

let adminPool: Pool | undefined
let adminDb: ReturnType<typeof drizzle> | undefined

function getAdminDb() {
  if (!adminDb) {
    if (!adminConnectionString) {
      throw new Error(
        'DATABASE_ADMIN_URL is required for cross-tenant queries (see drizzle/0001_rls.sql)',
      )
    }
    // Small pool on purpose. If this one is busy, something is routing ordinary
    // request traffic through the privileged role, and starving is the right symptom.
    adminPool = new Pool({ connectionString: adminConnectionString, max: 3 })
    adminDb = drizzle(adminPool, { schema })
  }
  return adminDb
}

export async function withoutTenantScope<T>(reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!reason) throw new Error('withoutTenantScope requires a stated reason')
  return getAdminDb().transaction(async (tx) => fn(tx as Tx))
}
