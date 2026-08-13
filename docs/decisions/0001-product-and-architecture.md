# ADR-0001 — Product wedge and core architecture

**Date:** 2026-08-13
**Status:** Accepted
**Method:** Cross-lab council of 7 independent model families via OpenRouter
(qwen3-coder-30b, deepseek-v4-pro, llama-4-scout, mistral-small-3.2-24b, gpt-5.6-luna,
kimi-k2-thinking, glm-5.2), each asked to rule on five questions and to disagree where
they genuinely differed. Measured cost $0.0318. Raw transcript: `docs/decisions/0001-council-raw.md`.

The council advises. The rulings below are mine, and where I overrode a majority I say so.

---

## Q1 — What is this product?

**Ruling: a statutory grievance-redressal compliance system for Indian higher education.**

6 of 7 labs independently picked this over campus-ops and student-super-app, for the same
reason: it is the only option where the buyer pays out of obligation rather than
convenience. The UGC (Redressal of Grievances of Students) Regulations require a Student
Grievance Redressal Committee, time-bound resolution, and an Ombudsperson appeal tier.
NAAC and NBA accreditation visits ask for the records. The incumbent is Excel, and Excel
cannot prove a response-time SLA to an inspection committee.

- **Buyer:** Registrar / Dean of Student Welfare, with the IQAC Coordinator as champion.
- **Budget line:** accreditation readiness, not student engagement.
- **Rejected — campus-ops workspace:** puts a solo engineer against TCS iON and Academia
  on integration breadth, which is a losing axis.
- **Rejected — student super-app:** needs network effects against WhatsApp, and the
  student is not the one with a budget.

### Accepted dissent (deepseek, "Member B") — and it changes the build

> Compliance is the *budget line*, not the product. Without student-side pull the
> complaints channel stays empty and the compliance record is a fiction.

This is the sharpest thing the council said. A grievance register nobody files into
produces a beautiful audit export of zero rows. The counter-pull is **published,
anonymised closure-time statistics** — median days-to-resolution per category, visible
without logging in. That is the one thing email structurally cannot do, it costs little
to build, and it is what makes students file. **Accepted and in scope for v1.**

## Q2 — Scope

**Ruling: the grievance compliance engine goes deep. The other two pillars stay
deliberately thin, and are labelled as such.**

The council was near-unanimous that pillars 1 and 2 should be cut. I am overriding that
in a limited way, because "finish the 2019 vision" is an explicit goal of this project
and the SRS promised three pillars. The reconciliation, which follows deepseek's
"Member A" dissent:

| Pillar | 2019 promise | Ruling |
|---|---|---|
| 3 — Complaints | built, as a copied template | **Production depth.** The whole product. |
| 1 — Information | never built | **Statutory disclosure page**, not a CMS. SGRC composition, Ombudsperson contact, anti-ragging committee, fee structure — UGC *mandates publishing* these, so it is a compliance artefact that helps the Registrar justify the purchase. Plus a deflection handbook, because roughly a third of a campus complaint box is a question with a documented answer. |
| 2 — News | never built | **Thin announcements surface.** Honest v1.5. Not a CMS, not the pitch. |

**The one capability that must be excellent:** proving that every grievance was handled by
the right person, within the applicable deadline, with a tamper-evident record.

## Q3 — Architecture

### Tenancy — shared Postgres, row-level security

5 of 7 agreed. Dissents were schema-per-tenant (kimi/"Arjun": RLS risks query-plan
leakage from a toxic large tenant) and database-per-tenant (kimi/"Vikram").

Both rejected. The dominant risk for a solo engineer is **migration drift** — one tenant
on schema v12 and another on v14, with no atomic rollback across N schemas. Query-plan
noise is a real but later problem, and it is observable; silent DDL skew across 200
schemas is neither.

Accepted hardening conditions, all of them non-optional:
- `FORCE ROW LEVEL SECURITY` on every tenant table, so even the table owner is subject.
- The runtime database role is **not** the migration owner and cannot bypass RLS.
- Tenant context is **transaction-local** (`set_config(..., true)`), never session-level.
  A pooled connection must not inherit the previous request's tenant. See `withTenant`.
- Repository-level scoping as a second, independent defence.
- Cross-tenant reads and writes are covered by integration tests, not assumed.

### Auth — the council genuinely split, and this is the weakest call in the document

gpt-5.6-luna and glm-5.2: never roll your own; use OIDC / Keycloak / SuperTokens.
deepseek: roll your own, because a college that wants the server in its own basement
cannot depend on a hosted provider.

**Ruling: own the narrow part, buy the wide part, and keep a seam.**
- Owned: password hashing (scrypt, stdlib) and server-side session records. This is the
  small, well-understood subset, and it is what makes an air-gapped deployment possible.
- Explicitly **not** repeated from 2019: reset-by-matching-email-and-phone. Reset is a
  single-use, hashed, expiring token.
- Institutional SSO goes through an OIDC seam rather than a second bespoke implementation.

I am recording this as the decision most likely to be revisited. If a design partner
demands SAML on day one, the seam is where it plugs in.

### Grievance history — append-only, hash-chained event log

Unanimous that an event log beats the 2019 `complaintremark` table. Current status is a
projection; corrections are new events, never edits.

**Accepted caveat (gpt-5.6-luna):** a hash chain makes tampering *evident*, not
*impossible* — database, backup, and administrator controls still carry the weight. The
documentation says "tamper-evident" and never "immutable" or "legally binding".

### Attachments — private storage, never the web root

The 2019 code ran `move_uploaded_file(..., "complaintdocs/".$name)` into a web-served
directory, which is remote code execution by upload. Replacement: storage outside the
web root, opaque keys, magic-byte sniffing rather than trusting the declared MIME type,
hard size caps, and per-download authorisation.

## Q4 — What most likely kills this

Three candidates surfaced. All three mitigations are cheap now and expensive later, so
all three are in scope.

1. **No college actually adopts it** (gpt-5.6-luna; glm's "the Registrar hates it").
   Highest probability, and it is a market risk, not a technical one. If filing is easier
   for students but the Registrar's day gets worse, the Registrar tells students to just
   email instead — and then blames the software at audit time.
   → *Mitigation:* the officer console is the first-class surface, and the queue-to-
   resolution path must take fewer clicks than replying to an email.
2. **Deployment into a creaking on-prem server** (deepseek). The buyer's IT admin is a
   lecturer on rotation. "Configure a Node runtime" loses the deal.
   → *Mitigation:* one-command Docker Compose, behind their existing nginx, no internet.
3. **DPDP Act 2023 liability** (kimi/"Vikram"). The 2019 code's md5 passwords and IDOR
   are now a regulatory exposure, not just bad practice.
   → *Mitigation:* port no old code. PII discipline from the first migration.

## Q5 — Go to market

- **No free tier.** 6 of 7, and the reasoning is about signalling: a free tier reads as
  "student project, unsupported", and Indian institutions are buying someone to hold
  responsible when it breaks. The one open-source dissent (AGPL as trojan horse) was
  withdrawn by its own author as too much for one engineer.
- **Lighthouse, then market.** The alma mater is the free reference deployment, not the
  revenue. Revenue comes from **private tier-2/3 colleges**, which the council correctly
  flagged can bypass the 9–18 month government tender cycle that would outlast any runway.
- **Price: ₹75,000 scoped paid pilot → ₹1.5–3L per year** for a mid-size private college.
  The council's spread was ₹40k to ₹8L. I reject the bottom (too cheap to be credible —
  price is part of the signal) and the top (no reference customers yet).
- Sell implementation and a monthly compliance report, not software access.

---

## What I owe the council

The strongest challenge I have not fully answered is luna's Q4: *a polished compliance
product with no design partner is a waste*. This repository is the artefact you take to
the first conversation, not evidence that the conversation went well. The next action is
a Registrar interview, not another feature.
