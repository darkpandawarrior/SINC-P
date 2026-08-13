#!/usr/bin/env node
/**
 * Blocks until Postgres accepts connections and answers a query, then exits 0.
 *
 * Used by `npm run db:up` after `docker compose up -d db`, and by the migrator
 * container's entrypoint — both wait on the actual thing (a working connection)
 * instead of racing the healthcheck or a fixed sleep.
 *
 * Defaults to the owner connection string, not the app one: on a freshly created
 * database the `sincp_app` role doesn't exist yet (drizzle/0001_rls.sql creates it),
 * but the owner role is created by Postgres itself on first boot.
 */
import { Client } from 'pg'

const url =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgres://sincp:sincp@localhost:5432/sincp'

const TIMEOUT_MS = 60_000
const INTERVAL_MS = 1_000
const redacted = url.replace(/:[^:@]*@/, ':***@')
const start = Date.now()

async function isReady() {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 2_000 })
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

for (;;) {
  if (await isReady()) {
    console.log(`Postgres is ready (${redacted}).`)
    process.exit(0)
  }
  if (Date.now() - start > TIMEOUT_MS) {
    console.error(`Postgres did not become ready within ${TIMEOUT_MS / 1000}s (${redacted}).`)
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS))
}
