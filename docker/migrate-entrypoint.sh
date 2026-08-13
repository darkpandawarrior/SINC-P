#!/bin/sh
# Entrypoint for the `migrator` Docker stage: bring the schema up to date, apply RLS,
# and optionally seed. Every step here is idempotent on purpose — this runs on every
# `docker compose up`, not just the first one, so an app image update can ship a schema
# change and the campus box picks it up without anyone running a manual migration.
set -eu

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required (owner role)}"
: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"

echo "==> Waiting for Postgres"
node scripts/wait-for-db.mjs

echo "==> Applying schema (drizzle-kit push)"
# drizzle.config.ts reads DATABASE_URL, not DATABASE_MIGRATION_URL — override it for
# just this command so schema DDL runs as the owner role. The container's real
# DATABASE_URL (the app role, set by docker-compose.yml) is untouched for the seed
# step below.
DATABASE_URL="$DATABASE_MIGRATION_URL" npx drizzle-kit push --force

echo "==> Applying row-level security policies"
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f drizzle/0001_rls.sql

echo "==> Applying password reset token table (additive — not part of drizzle-kit push, see src/db/schema.auth.ts)"
psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -f drizzle/0002_password_reset_tokens.sql

# 0001_rls.sql creates sincp_app with a hardcoded dev-only password if the role does not
# yet exist (see that file's header) — that's fine for the first boot, but the real
# password has to be set from DB_APP_PASSWORD every run, not just once, in case the
# operator rotated it in .env.
echo "==> Setting sincp_app password from DB_APP_PASSWORD"
# :'pw' quoting only expands when psql reads a script, not with -c — pipe it in.
echo "ALTER ROLE sincp_app WITH PASSWORD :'pw';" |
  psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -v pw="$DB_APP_PASSWORD"

if [ "${SEED:-false}" = "true" ]; then
  : "${DATABASE_URL:?DATABASE_URL is required to seed (app role)}"
  echo "==> Seeding demo data"
  npx tsx scripts/seed.ts
fi

echo "==> Migration complete"
