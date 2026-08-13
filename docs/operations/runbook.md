# Runbook

For whoever is on the end of the phone when something is wrong. That person is usually a
lecturer with the IT portfolio rather than an SRE, so every procedure here is a command to
paste and a result to compare against, not a diagnosis to perform.

Assume the deployment is the Docker Compose one from [deployment.md](../deployment.md),
behind the institution's own nginx.

---

## First, is it actually down?

```bash
docker compose ps                 # every service should say healthy or running
curl -sI http://localhost:3000/   # expect HTTP/1.1 200
docker compose logs --tail=50 app
```

If the app answers but a page is wrong, it is not down. Skip to the symptom below.

---

## The checks that matter, in order

Run these three before anything else. They take a minute and each one rules out a whole
class of problem.

```bash
npm run db:check-rls     # tenant isolation is actually switched on
npm run notify:send      # the outbox drains
npm run agents:run       # the SLA watchdog can sweep
```

`db:check-rls` is the one to run after **every** deploy. A schema push silently disables
row-level security, which is documented at length in [security.md](../security.md) and is
the single easiest way to turn a working system into a data-protection incident without
anything appearing broken.

---

## Symptoms

### "Students cannot log in"

Almost always one of three things.

```bash
# 1. Is the database reachable at all?
docker compose exec db pg_isready -U sincp

# 2. Is the app connecting as the restricted role, not the owner?
docker compose exec app printenv DATABASE_URL   # expect sincp_app, NOT sincp

# 3. Did RLS get dropped, or did the roles vanish?
npm run db:check-rls
```

If the logs contain `new row violates row-level security policy for table "sessions"`, the
runtime role cannot write sessions. Re-apply policies:

```bash
npm run db:rls && npm run db:check-rls
```

### "Nobody is receiving emails"

The outbox is deliberately separate from the app, so the app being healthy tells you
nothing about delivery.

```bash
npm run notify:send                      # sends the pending batch, prints counts
docker compose exec app printenv NOTIFY_TRANSPORT   # unset means it only prints to stdout
```

`NOTIFY_TRANSPORT` unset in production is the most common cause and it fails silently by
design during development. Then check the queue itself:

```sql
SELECT status, count(*) FROM notifications GROUP BY status;
SELECT last_error, count(*) FROM notifications
 WHERE status='failed' GROUP BY last_error ORDER BY 2 DESC LIMIT 5;
```

A message that failed five times is dead-lettered and will not retry. Fix the cause, then
requeue by setting those rows back to `pending` and `attempts = 0`.

### "A grievance is overdue and nobody was told"

```bash
npm run agents:run     # one sweep; prints breached / escalated / already flagged
```

If it reports breaches but zero escalated, they were already flagged on an earlier sweep,
which is correct and idempotent. If the timer is not running at all, the sweep has never
fired: check the cron entry or the `--watch` container.

Escalation queues a notification. It does not send one, so if the agent ran and the
Registrar heard nothing, the problem is the outbox above, not the agent.

### "The deadlines look wrong"

Almost always the working-day setting.

```sql
SELECT slug, sla_resolution_days, sla_use_working_days FROM institutions;
```

The UGC clause counts the SGRC's 15 days as **working** days. With
`sla_use_working_days = false` every deadline is roughly a week earlier than the
regulation requires, and the compliance report will show breaches that did not happen.

### "Someone can see a grievance they should not"

Stop and treat it as an incident.

```bash
npm run db:check-rls            # is RLS on, forced, and policied?
./docs/verification/run.sh      # 11 checks against a throwaway database
```

Capture, before changing anything:

```sql
SELECT kind, count(*) FROM auth_events
 WHERE created_at > now() - interval '7 days' GROUP BY kind;
```

If the report involves an **ICC** case, escalate to the institution immediately rather
than debugging first. That is a confidentiality breach under the PoSH regime, not a
display bug.

### "The audit trail looks wrong"

The chain is verified on every seed run and can be verified any time:

```sql
SELECT g.reference, count(e.*) AS events
  FROM grievances g JOIN grievance_events e ON e.grievance_id = g.id
 GROUP BY g.reference ORDER BY 2 DESC LIMIT 10;

-- Gaps in seq indicate deletion, which the trigger should have prevented.
SELECT grievance_id, count(*) AS n, max(seq) AS top
  FROM grievance_events GROUP BY grievance_id HAVING count(*) <> max(seq);
```

Any row returned by the second query is serious: `seq` is meant to be gap-free, and a gap
means something removed history despite the trigger. Preserve the database before doing
anything else.

---

## Backups

The audit trail is the product. A backup that has never been restored is a hope.

```bash
docker compose exec db pg_dump -U sincp sincp | gzip > sincp-$(date +%F).sql.gz
```

Restore into a scratch database and verify, rather than assuming:

```bash
gunzip -c sincp-2026-08-14.sql.gz | docker compose exec -T db psql -U sincp -d scratch
npm run db:check-rls          # policies must survive the restore
```

Policies and roles live in `drizzle/0001_rls.sql`, not in every dump shape. After any
restore, re-apply them and re-check.

---

## Deploying a new version

```bash
git pull
docker compose build app
npm run db:push          # schema, then RLS, then asserts RLS is on
docker compose up -d app
npm run db:check-rls     # again, because this is the one that bites
curl -sI http://localhost:3000/
```

`db:push` chains the policy re-apply for a reason. Running `drizzle-kit push` directly
leaves the database unprotected and nothing will tell you.

---

## What to escalate rather than fix

- Any suspected cross-tenant or ICC disclosure.
- A gap in `grievance_events.seq`.
- A restore that produces a database failing `db:check-rls` twice.

For these, preserve state and stop. The value of this system is that its record can be
trusted, and a well-meant repair that overwrites evidence costs more than the outage.
