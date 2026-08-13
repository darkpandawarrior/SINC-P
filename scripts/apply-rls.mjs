#!/usr/bin/env node
/**
 * Apply drizzle/0001_rls.sql — roles, policies, and the append-only trigger.
 *
 * Node rather than `psql -f` so this works on a machine with no Postgres client
 * installed, which is most developer laptops now that the database lives in Docker.
 *
 * Must run as the migration/owner role, not the runtime role: it creates roles and
 * alters tables. Idempotent — safe to run on every deploy, and `npm run db:push` does.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.join(here, '..', 'drizzle', '0001_rls.sql')

const url =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgres://sincp:sincp@localhost:5432/sincp'

const sql = await readFile(sqlPath, 'utf8')
const client = new pg.Client({ connectionString: url })

// NOTICE lines here are just "policy did not exist, skipping" from the idempotent
// DROP IF EXISTS calls. Real problems arrive as thrown errors.
client.on('notice', () => {})

await client.connect()
try {
  await client.query(sql)
  console.log('RLS policies applied.')
} catch (err) {
  console.error('Failed to apply RLS policies:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
