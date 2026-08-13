/**
 * Is a Postgres reachable for the integration suites?
 *
 * Roughly a quarter of this repo's tests talk to a real database on purpose: tenant
 * isolation, RLS, and the append-only trigger are database behaviour, and a mocked
 * version of them would assert nothing. The cost is that `npm test` on a fresh clone
 * with no Docker running used to produce five red files and a wall of ECONNREFUSED,
 * which reads as "this repo is broken" rather than "start the database first".
 *
 * So the integration suites skip instead, once, with a message that says what to do.
 * The probe runs a single connection attempt at module load and every suite shares
 * the result — probing per file would add a connection round trip to each one.
 */
import pg from 'pg'

const url =
  process.env.DATABASE_URL ?? 'postgres://sincp_app:sincp_app_dev_only@localhost:5432/sincp'

async function probe(): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 })
  try {
    await client.connect()
    await client.query('select 1')
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

export const dbAvailable = await probe()

export const SKIP_REASON =
  'needs Postgres — run `npm run db:up && npm run db:push && npm run db:seed`'

if (!dbAvailable) {
  // One line, once, rather than one failure per file.
  console.warn(`\n  [skipped] database-backed suites: ${SKIP_REASON}\n`)
}
