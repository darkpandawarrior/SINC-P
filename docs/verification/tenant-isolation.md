# Verified: tenant isolation and the append-only trail

Run against PostgreSQL 17.10 on 2026-08-13. These are transcripts of guards **firing**,
not a description of guards being configured. The distinction matters: a policy that
exists but does not fire is worse than no policy, because it buys false confidence.

Reproduce with `docs/verification/run.sh`.

## The hole this found

The first version of `drizzle/0001_rls.sql` keyed cross-tenant bypass off a session
setting:

```sql
SELECT COALESCE(current_setting('app.bypass_rls', true), 'off') = 'on'
```

Any role can write its own settings. So the application role could do this:

```sql
BEGIN;
SELECT set_config('app.bypass_rls','on', true);
SELECT count(*) FROM grievances;   -- 2   <-- both institutions
COMMIT;
```

One statement, and tenant isolation was off. Since the entire argument for RLS here is
"defence in depth against an application bug", a bypass reachable *from* the application
was worth nothing.

Fixed by making bypass a property of the role you connect as, which `sincp_app` cannot
grant itself:

```sql
SELECT pg_has_role(current_user, 'sincp_admin', 'member')
```

After the fix, the identical attack returns **0**.

## Results

| # | Test | Expected | Actual |
|---|---|---|---|
| 1 | Tenant A context lists grievances | only A's | `A-2026-00001 / Hostel water` |
| 2 | Tenant B context lists grievances | only B's | `B-2026-00001 / Mess food` |
| 3 | **No** tenant context set | fails closed, 0 rows | `0` |
| 4 | Tenant A reads B's row by explicit UUID (IDOR) | 0 rows | `0` |
| 5 | App role self-grants `app.bypass_rls` | 0 rows after fix | `2` before, `0` after |
| 6 | `sincp_admin` cross-tenant read (escape hatch) | works | `2` |
| 7 | `UPDATE grievance_events` as table owner | rejected | `ERROR: grievance_events is append-only (attempted UPDATE)` |
| 8 | `DELETE FROM grievance_events` as table owner | rejected | `ERROR: grievance_events is append-only (attempted DELETE)` |

Tests 7 and 8 are run **as the table owner**, deliberately. Running them as `sincp_app`
proves nothing, because the `REVOKE UPDATE, DELETE` stops the statement before the
trigger is ever reached — the first run of this suite made exactly that mistake and got
a misleading `permission denied` pass.

## What is still not proven here

- No test yet of a pooled connection inheriting a previous request's tenant. The
  `set_config(..., true)` third argument makes the setting transaction-local, and test 3
  shows the un-set case fails closed, but the specific pool-reuse path deserves its own
  integration test.
- Attachment download authorisation is covered by unit tests, not by this suite.
- Nothing here tests the application layer's use of `withTenant`; it tests the database
  floor beneath it.
