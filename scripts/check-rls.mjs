#!/usr/bin/env node
/**
 * Assert that row-level security is actually on.
 *
 * This exists because `drizzle-kit push` silently disables RLS and drops every policy.
 * It recreates tables to apply schema changes, and RLS flags and policies do not
 * survive that. There is no warning, and nothing appears broken afterwards: the
 * application still filters by institutionId in its own queries, so every page keeps
 * rendering the right rows. The only thing that changed is that the second line of
 * defence is gone, and you find out when an application bug turns into a cross-tenant
 * disclosure.
 *
 * Verified on Postgres 17: relrowsecurity flipped true -> false and policy count went
 * 1 -> 0 across a single `drizzle-kit push --force`.
 *
 * So: run this after every push, and in CI. `npm run db:push` chains it automatically.
 *
 *   node scripts/check-rls.mjs
 *
 * Exits non-zero and names the tables that are unprotected.
 */
import pg from 'pg'

const TENANT_TABLES = [
  'institutions',
  'users',
  'sessions',
  'categories',
  'grievances',
  'grievance_events',
  'attachments',
  'announcements',
  'handbook_entries',
  'auth_events',
  'notifications',
]

const url =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL ??
  'postgres://sincp:sincp@localhost:5432/sincp'

const client = new pg.Client({ connectionString: url })
await client.connect()

const { rows } = await client.query(
  `SELECT c.relname,
          c.relrowsecurity      AS enabled,
          c.relforcerowsecurity AS forced,
          (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
  [TENANT_TABLES],
)

const byName = new Map(rows.map((r) => [r.relname, r]))
const problems = []

for (const table of TENANT_TABLES) {
  const row = byName.get(table)
  if (!row) {
    problems.push(`${table}: table missing (run db:push first)`)
    continue
  }
  if (!row.enabled) problems.push(`${table}: RLS NOT ENABLED`)
  // FORCE matters as much as ENABLE: without it the table owner bypasses every policy,
  // and migrations plus any tooling that connects as owner would see all tenants.
  else if (!row.forced) problems.push(`${table}: RLS enabled but not FORCED`)
  else if (row.policies === 0) problems.push(`${table}: RLS on but NO POLICIES (denies everything)`)
}

// The runtime role must not be able to shrug RLS off, whatever the policies say.
const { rows: roleRows } = await client.query(
  `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('sincp_app','sincp_admin')`,
)
for (const r of roleRows) {
  if (r.rolname === 'sincp_app' && (r.rolsuper || r.rolbypassrls)) {
    problems.push(`role sincp_app must be NOSUPERUSER and NOBYPASSRLS (super=${r.rolsuper}, bypassrls=${r.rolbypassrls})`)
  }
}
if (!roleRows.some((r) => r.rolname === 'sincp_app')) {
  problems.push('role sincp_app does not exist (apply drizzle/0001_rls.sql)')
}

await client.end()

if (problems.length > 0) {
  console.error('RLS CHECK FAILED\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nFix: npm run db:rls')
  console.error('drizzle-kit push drops policies every time it recreates a table.')
  process.exit(1)
}

console.log(`RLS ok — ${TENANT_TABLES.length} tables enabled, forced, and policied.`)
