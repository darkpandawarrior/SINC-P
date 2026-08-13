# SINC-P

**Student grievance redressal for Indian higher education, built to the UGC (Redressal
of Grievances of Students) Regulations, 2023.**

Time-bound resolution with a statutory clock, an Ombudsperson appeal tier, a
tamper-evident record of every action, and a one-click audit export. The thing a
Registrar can hand an inspection committee instead of a spreadsheet.

---

## What this was

SINC-P began in 2019 as a final-year project at MANIT Bhopal, by **Siddharth Pandalai,
Nashit Shayan Khan, Nalin Gupta and Albin Thomas**. The SRS promised three pillars:
Information, News, and Complaints.

Only Complaints shipped, and it was a lightly re-skinned off-the-shelf PHP complaint
template. The tell is still in the original repository: the seeded categories were
`E-commerce`, `Online Shopping` and `E-wallet`, because the taxonomy was never adapted
to a campus at all. The `admin/` directory was copy-pasted to `Director/` to create a
second role, so the escalation ladder the SRS described was never actually implemented.

This is that project finished, in 2026, as something an institution could buy.
See [`docs/migration-from-2019.md`](docs/migration-from-2019.md) for the full accounting.

## The three pillars, and their honest depth

The 2026 scoping decision was deliberate and is argued in full in
[ADR-0001](docs/decisions/0001-product-and-architecture.md). Briefly:

| Pillar | 2019 | 2026 |
|---|---|---|
| **Complaints** | built, as a template | **Production depth.** The product. SLA engine, role ladder, hash-chained audit trail, compliance reporting. |
| **Information** | never built | **Statutory disclosures + deflection handbook.** Not a CMS. UGC mandates *publishing* SGRC composition, the Ombudsperson, and the grievance procedure, so this is a compliance artefact. |
| **News** | never built | **Thin announcements surface.** Honest v1.5. Deliberately not the pitch. |

A cross-lab council of seven independent model families argued for cutting pillars 1 and
2 entirely. That argument, the dissents, and why the scoping above overrides it are all
recorded in the ADR.

## What makes it defensible

**The statutory clock.** Every grievance carries a `dueAt` computed from the category
override or the institution default, in Asia/Kolkata, with optional working-day
counting. Breaches escalate up the UGC ladder. This is the question an auditor asks and
the one Excel cannot answer.

**A tamper-evident trail.** `grievance_events` is append-only and hash-chained: each
event commits to its predecessor, so a retro-edited remark or a deleted escalation
breaks verification at a nameable point. Enforced by a database trigger, not by
convention. It makes tampering *evident*, not impossible — see
[`docs/security.md`](docs/security.md) for what that does and does not buy.

**Published closure times.** `/transparency` shows anonymised median resolution time per
category without a login, with any cell below 5 grievances suppressed. A grievance
register nobody files into produces a beautiful audit export of zero rows; this is what
makes students file.

## Quickstart

```bash
cp .env.example .env.local
docker compose up -d db
npm install
npm run db:push          # schema
psql "$DATABASE_MIGRATION_URL" -f drizzle/0001_rls.sql   # RLS policies and roles
npm run db:seed          # 2 institutions, 20 users, 40 grievances, full event chains
npm run dev
```

Then <http://localhost:3000>. Every seeded account uses the password printed by the seed.

| Try | Account |
|---|---|
| Student view | `aarav.sharma@rit-bhopal.sincp.demo` |
| Triage queue | `anjali.rao@rit-bhopal.sincp.demo` (moderator) |
| Officer console | `suresh.iyer@rit-bhopal.sincp.demo` |
| Appeals | `ramesh.chandran@rit-bhopal.sincp.demo` (ombudsperson) |
| Settings, users, categories | `meera.joshi@rit-bhopal.sincp.demo` |

The seed creates **two** institutions on purpose, so cross-tenant isolation is something
you can try to break rather than something you have to take on trust.

## Verifying the security claims

Do not take the tenancy claims on faith. This script stands up a throwaway Postgres,
applies the schema and policies, and proves the guards *fire*:

```bash
./docs/verification/run.sh
```

Eight checks: per-tenant visibility, fail-closed with no tenant context, IDOR by
explicit UUID, the privileged-role escape hatch, and append-only enforcement against
UPDATE and DELETE. Results and the hole this process found are in
[`docs/verification/tenant-isolation.md`](docs/verification/tenant-isolation.md).

```bash
npm test          # unit and integration
npx tsc --noEmit  # types
```

## Architecture

Next.js 16 (App Router, Server Components), React 19, TypeScript strict, Tailwind 4,
Drizzle on Postgres 17, Vitest. No client-side data fetching; every page is a Server
Component calling the service layer.

```
src/
  db/schema.ts          10 tables, every tenant row carries institutionId
  db/client.ts          withTenant() — the only way to query tenant data
  lib/grievance/
    policy.ts           authz + the state machine, in one file on purpose
    audit.ts            hash chain
    sla.ts              statutory clock, Asia/Kolkata
    service.ts          every mutation, each writing its audit event in the same txn
  lib/auth/             scrypt, server sessions, CSRF, rate limiting
  app/(public)          landing, transparency, disclosures, status lookup
  app/(student)/my      file, track, withdraw, accept, appeal
  app/(staff)/staff     queue, case view, compliance dashboard
  app/(admin)/admin     users, categories, settings, security log
  app/(campus)          news, handbook
  proxy.ts              mints the CSRF cookie (Next 16 renamed middleware -> proxy)
drizzle/0001_rls.sql    RLS policies, roles, append-only trigger
scripts/
  seed.ts               demo data, verifies its own chains and tenant scoping
  import-legacy.ts      imports a real 2019 cms.sql dump
```

**Tenancy** is row-level security in a shared database: `FORCE ROW LEVEL SECURITY`, a
runtime role that is neither the owner nor a superuser, transaction-local tenant
context, and repository-level scoping as a second line. Cross-tenant access is a
property of *which role you connect as*, never of a setting the application can write.

**Migrating an existing 2019 deployment:**

```bash
npm run db:import-legacy -- --sql ./cms.sql --institution <uuid>   # dry run
npm run db:import-legacy -- --sql ./cms.sql --institution <uuid> --commit
```

Old md5 password hashes are deliberately **not** carried over; every imported user is
created deactivated and must reset.

## Status

Working and verified: the grievance lifecycle end to end, tenant isolation, the audit
chain, the SLA engine, auth, the legacy importer. 188 tests.

Known gaps are listed honestly in [`docs/security.md`](docs/security.md) — no malware
scanning on uploads, in-memory rate limiting that resets per process, no SSO, no
field-level encryption at rest. A security document that lists no gaps is not credible.

Commercial material lives in [`docs/gtm/`](docs/gtm/).

## Licence

AGPL-3.0. See [LICENSE](LICENSE).
