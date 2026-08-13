#!/usr/bin/env bash
# Reproduce the tenant-isolation and append-only evidence in tenant-isolation.md.
#
# Standalone: brings up its own throwaway Postgres, proves the guards fire, tears it
# down. Does not touch your dev database.
#
#   ./docs/verification/run.sh
set -euo pipefail

CONTAINER=sincp-verify-$$
# Random high port by default: a fixed one collides with whatever else is already
# bound on a developer machine, and the failure looks like a broken test rather than a
# busy port.
PORT=${PORT:-$((55000 + RANDOM % 4000))}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> starting throwaway postgres on :$PORT"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=sincp -e POSTGRES_PASSWORD=sincp -e POSTGRES_DB=sincp \
  -p "$PORT:5432" postgres:17-alpine >/dev/null

until docker exec "$CONTAINER" pg_isready -U sincp >/dev/null 2>&1; do sleep 1; done

echo "==> applying schema"
# DATABASE_MIGRATION_URL, not DATABASE_URL: drizzle.config.ts reads the migration URL
# first, so setting only DATABASE_URL here pushed the schema at whatever the developer's
# .env.local pointed to, and this throwaway database stayed empty.
DATABASE_MIGRATION_URL="postgres://sincp:sincp@localhost:$PORT/sincp" \
  npx --prefix "$ROOT" drizzle-kit push --force >/dev/null

echo "==> applying RLS policies"
docker exec -i "$CONTAINER" psql -U sincp -d sincp -q -v ON_ERROR_STOP=1 \
  < "$ROOT/drizzle/0001_rls.sql" >/dev/null

echo "==> seeding two institutions"
docker exec -i "$CONTAINER" psql -U sincp -d sincp -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
SET ROLE sincp_admin;
INSERT INTO institutions (id, slug, name) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a','college-a','College A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','college-b','College B');
INSERT INTO users (id, institution_id, email, full_name, password_hash, role) VALUES
  ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','s@a.edu','A Student','x','student'),
  ('22222222-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-00000000000b','s@b.edu','B Student','x','student');
INSERT INTO grievances (id, institution_id, reference, submitted_by_id, subject, body) VALUES
  ('99999999-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','A-2026-00001','11111111-0000-0000-0000-000000000001','Hostel water','no water'),
  ('88888888-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-00000000000b','B-2026-00001','22222222-0000-0000-0000-000000000002','Mess food','bad food');
RESET ROLE;
SQL

fail=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then printf '  ok    %-52s %s\n' "$1" "$3"
  else printf '  FAIL  %-52s expected %s, got %s\n' "$1" "$2" "$3"; fail=1; fi
}

q() { docker exec -i "$CONTAINER" psql -U "$1" -d sincp -h localhost -tAq -c "$2" 2>/dev/null | tr -d '[:space:]'; }

echo "==> isolation"
# SET LOCAL rather than SELECT set_config: it emits no result row, so the only thing
# on stdout is the count we are actually asserting on.
check "tenant A sees only its own" 1 \
  "$(q sincp_app "BEGIN; SET LOCAL app.institution_id='aaaaaaaa-0000-0000-0000-00000000000a'; SELECT count(*) FROM grievances; COMMIT;")"
check "tenant B sees only its own" 1 \
  "$(q sincp_app "BEGIN; SET LOCAL app.institution_id='bbbbbbbb-0000-0000-0000-00000000000b'; SELECT count(*) FROM grievances; COMMIT;")"
check "no tenant context fails closed" 0 \
  "$(q sincp_app 'SELECT count(*) FROM grievances;')"
check "IDOR by explicit uuid blocked" 0 \
  "$(q sincp_app "BEGIN; SET LOCAL app.institution_id='aaaaaaaa-0000-0000-0000-00000000000a'; SELECT count(*) FROM grievances WHERE id='88888888-0000-0000-0000-00000000000b'; COMMIT;")"
check "app role cannot self-grant bypass" 0 \
  "$(q sincp_app "BEGIN; SET LOCAL app.bypass_rls='on'; SELECT count(*) FROM grievances; COMMIT;")"
check "admin role escape hatch works" 2 \
  "$(q sincp_admin 'SELECT count(*) FROM grievances;')"

echo "==> append-only trail (as table owner, so the trigger is genuinely reached)"
docker exec -i "$CONTAINER" psql -U sincp -d sincp -q -c \
  "SET ROLE sincp_admin; INSERT INTO grievance_events (institution_id, grievance_id, seq, type, hash) VALUES ('aaaaaaaa-0000-0000-0000-00000000000a','99999999-0000-0000-0000-00000000000a',1,'submitted','abc');" >/dev/null

for op in "UPDATE grievance_events SET remark='rewritten' WHERE seq=1" "DELETE FROM grievance_events WHERE seq=1"; do
  if docker exec -i "$CONTAINER" psql -U sincp -d sincp -q -v ON_ERROR_STOP=1 -c "$op" >/dev/null 2>&1; then
    printf '  FAIL  %-52s statement succeeded\n' "${op%% *} rejected"; fail=1
  else
    printf '  ok    %-52s rejected\n' "${op%% *} on grievance_events"
  fi
done

echo "==> erasure: deleting a tenant must cascade, everything else must not"
if docker exec -i "$CONTAINER" psql -U sincp -d sincp -q -v ON_ERROR_STOP=1 \
     -c "DELETE FROM institutions WHERE id='bbbbbbbb-0000-0000-0000-00000000000b'" >/dev/null 2>&1; then
  printf '  ok    %-52s cascaded\n' "tenant erasure"
else
  printf '  FAIL  %-52s blocked\n' "tenant erasure"; fail=1
fi
check "the erased tenant is gone" 0 "$(q sincp_admin "SELECT count(*) FROM grievances WHERE institution_id='bbbbbbbb-0000-0000-0000-00000000000b'")"
check "the other tenant is untouched" 1 "$(q sincp_admin "SELECT count(*) FROM grievances WHERE institution_id='aaaaaaaa-0000-0000-0000-00000000000a'")"

echo
[ "$fail" -eq 0 ] && echo "ALL CHECKS PASSED" || { echo "FAILURES ABOVE"; exit 1; }
