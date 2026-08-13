# Security posture

This is a system of record for student grievances, some of them about ragging,
harassment and money. The data is sensitive, the users are often minors' peers, and the
buyer is accountable to a regulator. This document states what is defended, how it was
verified, and what is still open.

A security document with no open items is not a credible one. The gaps are at the end
and they are real.

## Trust boundaries

| Boundary | Control |
|---|---|
| Anonymous internet → public pages | No authentication. Aggregates only, small-cell suppressed. No individual grievance is reachable. |
| Student → their own grievances | Session, then `canView()` on every read, then RLS beneath that. |
| Staff → their institution's grievances | Role checked per route group, `canView()` per record, RLS beneath. |
| Institution A → Institution B | Postgres RLS. Not application logic. |
| Application → database | Runtime role is neither owner nor superuser and cannot bypass a policy. |
| Uploaded bytes → disk | Magic-byte sniffing, size cap while streaming, opaque keys, stored outside the web root. |

## Tenant isolation

Four independent layers, on the principle that any one of them will eventually have a
bug:

1. **Application scoping.** All tenant queries go through `withTenant(institutionId, …)`.
2. **Transaction-local context.** `set_config('app.institution_id', …, true)`. The
   third argument is load-bearing: with `false`, a pooled connection handed to the next
   request would inherit the previous tenant.
3. **`FORCE ROW LEVEL SECURITY`** on every tenant table, so policies bind the table
   owner too.
4. **A restricted runtime role.** `sincp_app` is `rolsuper = f`, `rolbypassrls = f`.

Cross-tenant access, needed for the login lookup before a tenant is known, runs as a
separate role on a separate pool.

### A hole this process found

The first version keyed the cross-tenant bypass off a session setting:

```sql
SELECT COALESCE(current_setting('app.bypass_rls', true), 'off') = 'on'
```

Any role can write its own settings, so the application role could run
`SELECT set_config('app.bypass_rls','on',true)` and read every institution. Verified
against a live database, not reasoned about: the query returned rows from both tenants.

Since the entire argument for RLS here is "defence in depth against an application
bug", a bypass reachable *from the application* was worth nothing. It is now
`pg_has_role(current_user, 'sincp_admin', 'member')`, a property of the connection, not
of anything the application can set. The identical attack now returns zero rows.

This is recorded because it is the interesting kind of finding: the code read correctly,
reviewed fine, and was wrong. Only executing it showed that.

### A second hole, found the same way

`drizzle-kit push` **silently disables RLS and drops every policy.** It recreates tables
to apply schema changes, and neither the `relrowsecurity` flag nor the policies survive
that. Measured on Postgres 17 across a single `drizzle-kit push --force`:

| | before | after |
|---|---|---|
| `relrowsecurity` on `grievances` | `true` | `false` |
| policies on `grievances` | 1 | 0 |

Nothing errors and nothing looks broken afterwards, because the application still
filters by `institutionId` in its own queries. Every page keeps rendering the correct
rows. The only thing that changed is that the second line of defence is gone, and you
discover that when an application bug becomes a cross-tenant disclosure.

This was caught by the seed script's own cross-tenant probe refusing to finish, not by
review. Two mitigations, both wired in:

- `npm run db:push` is now `drizzle-kit push && npm run db:rls && npm run db:check-rls`,
  so a push cannot leave the database unprotected.
- `scripts/check-rls.mjs` asserts every tenant table is enabled, **forced**, and has at
  least one policy, and that `sincp_app` is neither superuser nor `BYPASSRLS`. It exits
  non-zero and names the unprotected tables. Run it in CI and after every deploy.

The general lesson, which applies to the whole of this document: verify that a guard
*fires*, not that it is configured. A policy that exists in a `.sql` file and a policy
that is active in the database are different claims.

Reproduce all of it with `./docs/verification/run.sh`.

## The audit trail, and what it does not prove

`grievance_events` is append-only and hash-chained:

```
hash(n) = sha256( prevHash ‖ grievanceId ‖ seq ‖ type ‖ actorId ‖ remark ‖ payload ‖ createdAt )
```

Fields are joined with U+001F. Without a separator, `("ab","c")` and `("a","bc")` would
hash identically, which is a forgery primitive; there is a test for exactly that. Payload
keys are sorted so that key order cannot change a hash.

Enforcement is structural, not conventional: a `BEFORE UPDATE OR DELETE` trigger rejects
mutation, and `UPDATE`/`DELETE` are revoked from both application roles. Verified firing
as the table owner. Running that test as the unprivileged role proves nothing, because
the `REVOKE` stops the statement before the trigger is reached.

**What this buys:** a *partial* rewrite is detectable. A retro-edited remark or a removed
escalation breaks the chain at a nameable sequence number, which is precisely the
question an auditor is asking.

**What it does not buy:** immutability. Someone with database access and the ability to
recompute can rewrite the entire chain. Hash chaining makes tampering **evident**, not
impossible. Backup retention, restricted roles, and operational controls carry the rest,
and this system does not make a legal-admissibility claim. Marketing copy that says
"immutable" or "blockchain-grade" would be false and should be rejected.

## Authentication

- **scrypt**, N=2^16, r=8, p=1, per-password salt, parameters stored with the hash so
  they can be raised without invalidating existing rows. `needsRehash()` upgrades
  transparently on next login.
- **Server-side sessions.** The cookie carries a 32-byte random token; only its SHA-256
  is stored, so a database dump does not yield live sessions. Revocation is a `DELETE`,
  which is what a stateless JWT could not give us. "Disable this officer now" has to
  mean now.
- **Uniform failure.** Wrong password, unknown address, deactivated account and rate
  limit all return one message, and the unknown-address path still performs a hash so
  response timing does not answer "does this account exist".
- **CSRF.** Double-submit cookie, `httpOnly` so page JS cannot read it, compared with
  `timingSafeEqual`. The cookie is minted in `proxy.ts`; a Server Component can read
  cookies but cannot set them.
- **Open redirect.** `returnTo` is validated both when rendered and on submit. A
  protocol-relative `//evil.example` reads as a path and is rejected.

## Uploads

Declared Content-Type and file extension are treated as untrusted display data. The
stored type comes from magic-byte inspection, the allow-list is PDF/PNG/JPEG/WEBP/text,
the size cap is enforced while streaming rather than after buffering, keys are random
rather than user-supplied, resolved paths are asserted to stay inside `STORAGE_DIR`, and
every download re-checks `canView()` on the parent grievance.

## Privacy and DPDP Act 2023

- No individual grievance appears on any unauthenticated page.
- `/transparency` suppresses any cell computed from fewer than 5 grievances. In a single
  department a count of 1 is re-identifiable. Suppression is enforced in the query layer,
  not the view, because enforcing it in the view is how it eventually leaks.
- Anonymous filing hides the filer from staff UI while retaining the identity for audit,
  and the student is told plainly which of those is true.
- No third-party analytics, no external fonts, no CDN. The CSP blocks outbound requests,
  so grievance content cannot leak into someone else's logs.
- Old md5 hashes are not migrated, so a legacy import does not carry a known-broken
  credential store into the new system.

## Notifications

Messages are queued in the same transaction as the event that caused them, then
delivered out of band. Two properties matter for security rather than for reliability:

- **Anonymous filings are never emailed.** The identity is retained for audit but no
  message is addressed to it, because the filing form promises the committee will not
  see who filed.
- **The SMTP client dot-stuffs bodies and strips CR/LF from headers.** A body line that
  is a single `.` terminates the DATA command, so an unescaped one truncates the mail
  and lets the remaining text be read as SMTP commands. A newline in a subject would let
  a grievance title append its own `Bcc:`. Both have tests.

Delivery is at-least-once. A `dedupeKey` makes a repeated escalation sweep idempotent,
and a message that fails five times is dead-lettered rather than retried forever.

## Erasure

The append-only trigger permits a `DELETE` that arrives as a cascade from removing a
parent (`pg_trigger_depth() > 1`) and refuses every direct one. Without that, deleting
an institution was impossible and there was no way to honour a DPDP erasure request or
offboard a tenant.

This does not weaken the trail, because `DELETE` on `grievances` is revoked from both
application roles. The only route to a cascade is an owner deliberately removing a
tenant. What stays forbidden is the thing the chain exists to prevent: editing or
removing history while keeping the case it describes. Covered by
`docs/verification/run.sh`, which asserts both the cascade and the refusal.

## Known gaps

Ordered by how much they would worry a real deployment.

1. **No malware scanning on uploads.** A clean PDF that is nonetheless malicious will be
   stored and served to staff. ClamAV before the file becomes downloadable is the fix,
   and it is not built.
2. **Rate limiting defaults to in-process memory.** It resets on restart and does not
   coordinate across instances. A shared Postgres store exists behind
   `RATE_LIMIT_STORE=postgres` and is what a multi-instance deployment should set. The
   default is memory because the single-container deployment is the common case and it
   costs nothing.
3. **No SSO.** Institutions with existing identity infrastructure will ask for SAML or
   OIDC. There is a seam for it, not an implementation. This was the council's most
   divided architectural question and is the decision most likely to be revisited.
4. **No field-level encryption at rest.** Grievance bodies are plaintext in Postgres.
   Disk encryption and restricted roles are the current answer; `pgcrypto` on the
   sensitive columns is the better one, and retrofitting it later means a table rewrite.
5. **No MFA**, for any role, including `institution_admin`.
6. **Pool-reuse tenant inheritance is argued, not directly tested.** The transaction-local
   setting and the fail-closed no-context case are both verified, but there is no test
   that specifically hammers a reused pooled connection across tenants.
7. **Dependency scanning** runs in CI and fails on high or critical advisories. Moderate
   and low are reported without blocking, deliberately: a blocking gate on every moderate
   advisory in a build tool trains people to add ignore entries, which is worse than the
   advisory. Four moderate advisories are open at the time of writing.
8. **Attachment retention and legal hold are undefined.** DPDP expects a deletion story;
   there is currently no expiry job.

## Reporting

Security issues should go to a private channel, not a public issue. For a deployed
institution that means the contact on the disclosures page.
