# Deployment

This is written for the person who actually has to run this: a lecturer or lab
assistant given "IT admin" duties on the side, on a college's own Ubuntu box, with no
budget for a managed cloud. If that's not you, the short version is: `docker compose up
-d --build`, then read the "First run" section below for the one thing you must change
before anyone real uses it.

## What you need

- A Linux server (Ubuntu 22.04+ is what this was tested against) with **Docker Engine**
  and the **Compose plugin**. Install both with Docker's own convenience script:
  ```
  curl -fsSL https://get.docker.com | sudo sh
  ```
  That's the only thing this deployment asks you to install by hand. No Node.js, no
  Postgres, no npm, all of that lives inside the containers.
- The repository, on that box. `git clone`, or copy the folder over, either is fine.
- Internet access **for the first build only** (pulling the `node:22-alpine` and
  `postgres:17-alpine` base images, and `npm ci` fetching packages). Once the images are
  built, restarting the stack, reboots included, needs no internet.
- The college's existing nginx already running on the box, terminating TLS on 80/443.
  This stack does not touch nginx config; it just needs one vhost pointed at it (below).

## Quick start

```
git clone <repo-url> sincp && cd sincp
docker compose up -d --build
```

That works with zero configuration, every value has a demo-safe default. Before real
students touch it, copy `docker-compose.env.example` to `.env` and fill in the three
passwords/secret (see "Configuration" below).

That one command:

1. Starts Postgres 17 (`db`), with a named volume so data survives a container restart.
2. Runs a one-shot `migrate` container that pushes the schema, applies the row-level
   security policies in `drizzle/0001_rls.sql`, rotates the application role's password
   to what's in `.env`, and, only if `SEED=true`, loads the demo data. It then exits.
3. Starts the `app` container (the Next.js server) once `migrate` has exited `0`.

Check it came up:

```
docker compose ps
docker compose logs -f migrate   # one-shot; should end with "Migration complete"
curl -sI http://127.0.0.1:3000   # or whatever APP_PORT you set
```

## Configuration

Everything is read from a `.env` file next to `docker-compose.yml` (Compose loads it
automatically, nothing to source by hand). Every variable has a workable default so the
stack comes up with **zero** configuration for a first look, but three of them are
dev-only placeholders and **must** be changed before this holds anyone's real data:

| Variable | Default | Change before production because... |
|---|---|---|
| `DB_OWNER_PASSWORD` | `sincp_owner_dev_only` | this is the Postgres superuser password |
| `DB_APP_PASSWORD` | `sincp_app_dev_only` | this is what the running app authenticates with |
| `SESSION_SECRET` | a literal placeholder string | anyone who reads the repo can forge a session cookie otherwise. Generate one with `openssl rand -base64 32` |

The rest, all optional:

| Variable | Default | What it does |
|---|---|---|
| `DB_OWNER_USER` | `sincp` | Postgres role that owns the schema and runs migrations |
| `DB_NAME` | `sincp` | database name |
| `APP_PORT` | `127.0.0.1:3000` | host bind for the app. Loopback-only by default, see nginx below. Set to a bare port (e.g. `8080`) to expose on all interfaces without nginx |
| `SEED` | `false` | set `true` for a first run on a demo or pilot box (see below) |
| `STORAGE_MAX_BYTES` | `10485760` (10 MiB) | per-file attachment cap |

A minimal `.env` for a real pilot:

```
DB_OWNER_PASSWORD=<openssl rand -base64 24>
DB_APP_PASSWORD=<openssl rand -base64 24>
SESSION_SECRET=<openssl rand -base64 32>
```

Note what's deliberately absent: the `db` service publishes no host port. Postgres is
reachable only from other containers on the compose network. If you need `psql` from the
host for a backup or a manual check, use `docker compose exec db psql -U sincp -d sincp`
rather than opening the port.

## nginx

Point the college's existing nginx at the app container's published port (127.0.0.1:3000
by default):

```nginx
server {
    listen 443 ssl;
    server_name grievances.example.edu;

    # ... your existing TLS config ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`next.config.ts` already sets HSTS, CSP and the other security headers application-side,
so nginx doesn't need to duplicate them.

## First run: seeding the demo

Set `SEED=true` in `.env` before the first `docker compose up`, or run it on demand
against a stack that's already up:

```
docker compose run --rm -e SEED=true migrate
```

This loads two fictional institutions with realistic Indian engineering-college
categories, twenty-odd users across every role, and ~40 grievances spread across every
status and SLA state (on track, due soon, breached, resolved, appealed), enough to make
the compliance dashboard look like a real semester rather than an empty table. Every
grievance's history is hash-chained and the seed verifies every chain and a cross-tenant
read before it prints anything, so a successful run is itself evidence RLS is working on
this box, not just in CI. Dev login credentials print at the end, **do not leave
`SEED=true` set once real students are using the system**; it's idempotent (safe to
re-run without duplicating data) but there's no reason to seed a live tenant.

## Updating

```
git pull
docker compose up -d --build
```

`migrate` re-runs on every `up`, pushing the schema again and re-applying RLS are both
idempotent, so a schema change in a new release gets picked up automatically. `app`
restarts once `migrate` exits `0`. There is no separate "run migrations" step to
remember.

## Backups

```
docker compose exec db pg_dump -U sincp -Fc sincp > backup-$(date +%F).dump
```

Restore into a fresh volume:

```
docker compose exec -T db pg_restore -U sincp -d sincp --clean --if-exists < backup-2026-08-13.dump
```

The `pgdata` and `storage` named volumes are what actually needs backing up long-term;
back up the Docker volumes directory (or script the `pg_dump` above on a cron) rather
than relying on container state, which `docker compose down` without `-v` preserves but
a bad `-v` does not.

## Troubleshooting

- **`migrate` container keeps exiting non-zero.** `docker compose logs migrate`, the
  entrypoint fails loudly and names the step (schema push, RLS, or seed). A broken hash
  chain or a cross-tenant read succeeding are both treated as fatal on purpose.
- **Port already in use.** Something else on the box is on 3000 or 5432. Postgres isn't
  published by default (see above); for the app, change `APP_PORT` in `.env`.
- **"database is starting up" / app can't connect.** `app` waits on `migrate` finishing,
  which waits on `db`'s healthcheck, a slow first boot (Postgres initializing its data
  directory) is normal on first run, not a bug. `docker compose logs db` should show
  `database system is ready to accept connections` within a few seconds.
- **Changed `DB_APP_PASSWORD` in `.env` but the app still can't authenticate.** `app`
  and `migrate` both read the password at container start; `docker compose up -d
  --force-recreate app migrate` picks up a changed `.env` without a full rebuild.

## Local development without Docker

For iterating on the app directly with `next dev` rather than through the app
container. `db:up` only starts the `db` service via Compose and waits for it, it does
not build or run the app image, so this is a separate path from testing the deployment
itself; use `docker compose up -d --build` for that.

```
npm install
cp .env.example .env
npm run db:up

# next dev reads .env automatically; a bare `tsx` script (drizzle-kit, the seed) does
# not, so export the same values into the shell for this one-time setup.
export DATABASE_MIGRATION_URL=postgres://sincp:sincp@localhost:5432/sincp
export DATABASE_URL=postgres://sincp_app:sincp_app_dev_only@localhost:5432/sincp
# withoutTenantScope() needs a BYPASSRLS connection. The owner role qualifies because
# it's the Postgres image's initdb superuser — not in .env.example since most of the
# app never needs it.
export DATABASE_ADMIN_URL="$DATABASE_MIGRATION_URL"

# drizzle.config.ts reads DATABASE_URL, so schema push needs the owner role for this one
# command even though the app itself runs as sincp_app — same reason the Docker migrate
# entrypoint overrides it the same way. See docker/migrate-entrypoint.sh.
DATABASE_URL="$DATABASE_MIGRATION_URL" npx drizzle-kit push
psql "$DATABASE_MIGRATION_URL" -f drizzle/0001_rls.sql   # one-time per fresh database

npm run db:seed
npm run dev
```
