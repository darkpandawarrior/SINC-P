<div align="center">

<img src="docs/assets/banner.svg" alt="SINC-P: student grievance redressal for Indian higher education" width="800"/>

### Shikayat likhne se kuch nahi hota. Unless someone is holding a clock.

In 2019, four of us at MANIT Bhopal wrote an SRS promising three things: campus **I**nformation,
campus **N**ews, and student **C**omplaints. We shipped one of them, and even that one was a
complaint-box template downloaded off the internet whose categories still said *E-commerce*,
*Online Shopping* and *E-wallet*. Nobody ever changed them. Seven years later I came back and
finished the idea properly: a statutory grievance system an Indian institution can put in front of
a UGC inspector, with a clock on every case and a record nobody can quietly edit.

[![CI](https://github.com/darkpandawarrior/SINC-P/actions/workflows/ci.yml/badge.svg)](https://github.com/darkpandawarrior/SINC-P/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript_strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres_17-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)
![Tests](https://img.shields.io/badge/tests-271-success?style=flat-square)
![Coverage](https://img.shields.io/badge/coverage-73%25-success?style=flat-square)
![Tenant isolation](https://img.shields.io/badge/tenant_isolation-Postgres_RLS-0f766e?style=flat-square)
![UGC](https://img.shields.io/badge/UGC_Grievance_Regs-2023-0ea5e9?style=flat-square)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-64748b?style=flat-square)](LICENSE)

**[Why](#why-sinc-p)** · **[Highlights](#highlights)** · **[What changed](#what-changed-since-2019)** · **[Screens](#screens)** · **[Docs](#documentation)** · **[Design](#two-registers-one-system)** · **[AI and agents](#the-2026-layer-ai-and-agents)** · **[Architecture](#architecture)** · **[Getting started](#getting-started)** · **[Compliance](#compliance-cited)** · **[Prove it](#prove-it-yourself)** · **[Honesty](#whats-real-and-what-isnt-honestly)**

**Portfolio:** [cv-siddharth.vercel.app](https://cv-siddharth.vercel.app/) &nbsp;·&nbsp; **Origin:** final-year project, MANIT Bhopal, 2019 &nbsp;·&nbsp; **Siblings:** [Mileway](https://github.com/darkpandawarrior/Mileway) · [PaymentsLab](https://github.com/darkpandawarrior/PaymentsLab) · [Kursi](https://github.com/darkpandawarrior/Kursi)

</div>

---

<details>
<summary><b>Table of contents</b></summary>

- [Why SINC-P](#why-sinc-p)
- [Highlights](#highlights)
- [What changed since 2019](#what-changed-since-2019)
- [The three pillars, and their honest depth](#the-three-pillars-and-their-honest-depth)
- [Screens](#screens)
- [Two registers, one system](#two-registers-one-system)
- [The 2026 layer: AI and agents](#the-2026-layer-ai-and-agents)
- [Architecture](#architecture)
  - [Tenancy, in four layers](#tenancy-in-four-layers)
  - [The audit chain](#the-audit-chain)
  - [The statutory clock](#the-statutory-clock)
  - [Module map](#module-map)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Compliance, cited](#compliance-cited)
- [Prove it yourself](#prove-it-yourself)
- [Three bugs that only running the thing found](#three-bugs-that-only-running-the-thing-found)
- [What's real and what isn't, honestly](#whats-real-and-what-isnt-honestly)
- [Migrating a real 2019 deployment](#migrating-a-real-2019-deployment)
- [Testing and quality](#testing-and-quality)
- [Security posture](#security-posture)
- [Commercial material](#commercial-material)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Credits](#credits)

</details>

> **At a glance.** **25 routes** across five role-scoped areas · **12 tables**, 11 of them tenant-scoped
> under `FORCE ROW LEVEL SECURITY` · **271 tests** at 73% coverage, plus an 8-step browser journey ·
> a hash-chained audit trail re-verified on every seed run · **one command** that proves tenant
> isolation actually fires instead of asking you to believe it.

## Why SINC-P

Every campus already has a complaints channel. It is an email address, and it is a black hole.
You send your hostel water problem into it, and the only feedback loop is whether the water comes
back. Nobody can tell you if anyone read it, who owns it now, or whether the fifteen day window
the UGC gives them has already run out.

That window is the whole product. The UGC (Redressal of Grievances of Students) Regulations, 2023
require every institution to run a Student Grievance Redressal Committee, resolve inside a
statutory clock, and offer an Ombudsperson appeal tier. NAAC and NBA visits ask to see the
records. What most colleges actually have is a spreadsheet, maintained by whoever was free, and a
spreadsheet cannot prove a response time to an inspection committee.

So the buyer is not a student. It is the Registrar or the Dean of Student Welfare, the budget line
is accreditation readiness, and the competitor is Excel.

I did not decide that alone. The product question went to a council of seven independent model
families (deepseek, kimi, glm, gpt, llama, qwen, mistral), each asked to rule and to disagree
where they genuinely differed. Six of seven picked compliance over the alternatives for the same
reason: it is the only wedge where the buyer pays out of obligation rather than enthusiasm. The
full ruling, the dissents, and the two places where I overruled the majority are in
[**ADR-0001**](docs/decisions/0001-product-and-architecture.md), with the raw transcript beside it.

The dissent that changed the build came from deepseek, and it was the sharpest thing anyone said:

> Compliance is the *budget line*, not the product. Without student-side pull the complaints
> channel stays empty and the compliance record is a fiction.

Which is correct, and slightly brutal. A grievance register nobody files into produces a beautiful
audit export of zero rows. So the system publishes its own closure times, anonymised, without a
login, at [`/transparency`](#screens). Students can see that Ragging and Harassment cases close in
a median of 4 days while Transport takes 12. That number is the reason anyone files. The Registrar
buys the audit trail; the students show up for the scoreboard.

## Highlights

- ⏱️ **A statutory clock that survives an audit.** Every grievance carries a `dueAt` computed from
  the category override or the institution default, in Asia/Kolkata, in calendar or working days.
  The timezone handling is deliberate: IST sits at a fixed +5:30, so a due date computed off UTC
  calendar days lands a day early or late depending on what time somebody filed, and you find out
  during an inspection. Breaches escalate officer → admin → Ombudsperson.
- 🔗 **An append-only trail that shows its teeth.** `grievance_events` is hash-chained, each event
  committing to the one before it. A retro-edited remark or a deleted escalation breaks
  verification at a nameable sequence number. Enforced by a `BEFORE UPDATE OR DELETE` trigger and
  a `REVOKE`, not by good intentions. (The UI says *tamper-evident, not tamper-proof*, because
  that is the honest claim and overselling it would be the one lie an auditor could catch.)
- 🏛️ **Tenant isolation you can attack.** Four independent layers, on the assumption any one of
  them will eventually have a bug: application scoping, transaction-local tenant context,
  `FORCE ROW LEVEL SECURITY`, and a runtime role that is neither owner nor superuser.
  `./docs/verification/run.sh` stands up a throwaway Postgres and tries to break all of it.
- 📊 **Published closure times, with the small cells suppressed.** Any figure computed from fewer
  than five grievances renders as `—`, enforced in the query layer rather than the view, because
  enforcing it in the view is how it eventually leaks. In one department a count of one is a name.
- 🧾 **The escalation ladder the 2019 SRS actually described.** Student files, moderator screens
  and routes, redressal officer resolves, Ombudsperson hears appeals. The original code had two
  copy-pasted folders called `admin/` and `Director/` and no escalation at all.
- 🔐 **scrypt instead of `md5()`.** N=2¹⁶, per-password salt, parameters stored with the hash so
  they can be raised later without locking anybody out. The 2019 table stored bare unsalted md5,
  which means every password in it was recoverable in about the time it takes to read this bullet.
- 📎 **Uploads that cannot become a shell.** Magic-byte sniffing rather than trusting the declared
  type, a size cap enforced while streaming rather than after buffering, opaque storage keys
  outside the web root, and authorisation re-checked on every download. The 2019 version wrote
  `$_FILES` straight into a web-served folder under the user's own filename.
- 🚦 **Rate limiting that survives a second instance.** Counters live in Postgres, not
  Redis, because Redis is one more thing for a college IT admin to install and fail to
  restart, and the deployment story is already the second most likely way this dies. A
  rate-limit check is one indexed upsert; the concurrency test fires ten simultaneous
  hits at one key and asserts exactly four get through a budget of four.
- 📬 **A transactional outbox, not fire-and-forget email.** A queued message is written in
  the same transaction as the thing that caused it, so a rolled-back status change cannot
  tell a student their case moved. Delivery happens out of band, which keeps SMTP latency
  and SMTP outages out of the request path entirely.
- 🧪 **Tests that skip instead of screaming.** 47 of the 194 talk to a real Postgres on purpose,
  because RLS and database triggers cannot be meaningfully mocked. Without a database they skip
  with a message telling you which command to run, so a fresh clone never looks broken.
- 🇮🇳 **Built for the actual buyer.** AISHE code on the institution record, Asia/Kolkata clocks,
  a category tree that starts at Hostel and Mess, and a sensitive-category flag that gives Ragging
  and Harassment a shorter SLA and a bypass around triage.
- 🗃️ **A migration path for the real thing.** `scripts/import-legacy.ts` reads a genuine 2019
  `cms.sql` dump, replays every remark into a valid hash chain, and verifies each chain *before*
  writing it. It refuses to carry the md5 hashes across.

## What changed since 2019

The entire 2019 tree is gone. Nothing was ported: not the code, not the schema, not the passwords.
That sounds dramatic for a college project, and it is worth being specific about why, because
almost every line below is an ordinary mistake that is still running at institutions today.

| 2019 | 2026 | What was actually wrong |
|---|---|---|
| `mysqli_query($con, "SELECT * FROM users WHERE userEmail='".$_POST['username']."'")` | Parameterised queries with RLS underneath | **Unauthenticated SQL injection.** Typing `' OR '1'='1' -- ` into the login box logged you in as the first user in the table. Every single query was built by string concatenation. |
| `md5($_POST['password'])`, no salt | scrypt, N=2¹⁶, per-password salt | **Instantly reversible.** Identical passwords produced identical hashes, so one dump told you which students shared a password. |
| `admin/` copy-pasted to `Director/` | One console, one role enum, one `policy.ts` | Forty duplicated files that drifted apart. The SRS described an escalation ladder. The code implemented two identical dashboards. |
| `complaint-details.php?cid=5` | `canView(actor, grievance)` on every read path | **IDOR.** Any logged-in student read every other student's grievances by counting upwards. There was no ownership check anywhere. |
| `move_uploaded_file($_FILES["compfile"]["tmp_name"], "complaintdocs/".$name)` | Sniffed, capped, opaque, outside the web root | **Remote code execution by upload.** Upload `shell.php`, request `shell.php`, own the server. |
| `complaintremark`, editable in place | Append-only hash-chained `grievance_events` | An officer could rewrite a past remark and claim it always said that. In a compliance product that is the entire ballgame. |
| `status varchar(50)`, `NULL` meaning pending | A real state machine with an explicit transition matrix | The dashboard had to query `WHERE status is null`. No transition was ever illegal, so a closed grievance could silently reopen. |
| Reset by matching email **and phone number** | Single-use hashed token, 30 minute expiry | **Account takeover by anyone who knew your phone number.** There was no token at all. |
| Categories: `E-commerce`, `Online Shopping`, `E-wallet` | A real campus tree with per-category SLA overrides | The clearest tell of all. The taxonomy was never adapted, because the app was a template. |
| `error_reporting(0)` | Errors surface in dev, structured logging in prod | Silencing errors does not remove them. It removes your ability to see them. |

The full accounting, including how a real deployment's data migrates across, is in
[**docs/migration-from-2019.md**](docs/migration-from-2019.md).

## The three pillars, and their honest depth

The council voted to cut pillars 1 and 2 outright and ship only the grievance engine. I overrode
that, partially, because finishing the original vision was the entire point of coming back. But I
scoped them hard so they cannot quietly turn into a CMS project.

| Pillar | 2019 | 2026 | Depth |
|---|---|---|---|
| **Complaints** | shipped, as a template | The product. SLA engine, role ladder, hash chain, compliance reporting. | Production |
| **Information** | never built | Statutory disclosures (SGRC composition, Ombudsperson, procedure) plus a deflection handbook. UGC mandates *publishing* these, so it is a compliance artefact rather than a CMS. | Real, narrow |
| **News** | never built | An announcements surface with channels and pinning. | Deliberately thin |

Roughly a third of what lands in a campus complaint box is a question with a documented answer,
which is why the handbook exists and why the filing form surfaces matching entries before it
accepts anything. Deflection is a feature, not a shortcut.

## Screens

![The officer queue, sorted by what breaches soonest](docs/screenshots/03-officer-queue.png)

*The queue sorts by what breaches soonest, never by newest, because "newest first" is how a case
ages quietly into a violation.* Filters on status, category, assignee and SLA state, with bulk
assign and move. Every status carries an icon as well as a colour, so the board still reads for a
colour-blind warden.

![A case, with its full hash-chained trail](docs/screenshots/04-case-view.png)

*The case view.* The trail is the hash chain rendered as a timeline. Internal remarks are visually
marked so nobody guesses wrong about what the student can read, and the action panel offers only
the transitions `canSetStatus` actually permits for this actor, so the interface never shows a
button the server will refuse. The callout says tamper-evident rather than tamper-proof, which is
the honest claim.

![The officer console surfacing a systemic issue](docs/screenshots/08-systemic-patterns.png)

*Four separate grievances, one underlying problem.* Block C lost water on a Monday and four
students filed about it in their own words. Resolved individually, that is four closures and a
healthy median with nobody recording that a hostel block had no water for a week. Grouped by
shared wording, not by a model, and the officer is told to judge it themselves.

![Published closure times, with small cells suppressed](docs/screenshots/02-transparency.png)

*The transparency page, which needs no login.* Median days to resolution per category, with any
cell computed from fewer than five grievances withheld. Ragging and Harassment closes in a median
of 4 days against 12 elsewhere, because that category carries a shorter statutory override. Charts
are inline SVG with an accessible table underneath, no charting library, no external requests.

| | |
|---|---|
| ![The student's own grievances](docs/screenshots/06-student-portal.png) | ![Filing a grievance](docs/screenshots/07-file-grievance.png) |
| **The student portal.** Where each grievance actually is, and what happens next. | **Filing.** Matching handbook entries surface before the form accepts anything, because roughly a third of a campus complaint box is a question with a documented answer. |

![The compliance dashboard](docs/screenshots/05-compliance.png)

*The screen that gets screenshotted into a NAAC self-study report.* Median resolution by category,
breach counts, ageing buckets, appeal rate, CSV export, and a print stylesheet that produces a
clean A4 page.

## Two registers, one system

This product has two audiences who need opposite things from the same screens.

A Registrar working forty cases before an accreditation visit needs calm, dense and
printable. Vibrance there is noise, and noise costs them accuracy. A nineteen-year-old
filing at 11pm about a hostel with no water needs to believe somebody will read it, and
institutional grey tells them exactly what every other college portal already has: that
this is a form that goes nowhere.

So there are two registers over one token set. The officer console keeps the calm palette.
The public and student surfaces opt into a warmer one with `data-surface="public"`. Same
contrast floors, same status colours (red still means overdue everywhere), different
emotional weight.

**What is actually in there:**

- **A colour field behind the hero**, three blurred radial gradients drifting on a 26
  second loop. No image to download, nothing for the CSP to block, and it scales to any
  viewport without a second asset.
- **Native view transitions** via `@view-transition`, so navigation cross-fades with zero
  JavaScript and degrades to nothing where unsupported.
- **A command palette** on `⌘K`, because the officer console's real user opens it forty
  times a day and knows where they are going. It navigates and toggles the theme. It
  cannot change a grievance: a keyboard shortcut that resolves a case eventually resolves
  the wrong one.
- **The SLA ring**, pure SVG with a `stroke-dasharray`. It renders identically in a Server
  Component, in a print stylesheet, and with scripting off, and it pulses when a case is
  overdue. The label is not decorative, because colour alone would fail anyone with a
  colour vision deficiency on the one question that matters most.
- **Staggered table rows**, so a queue reads as arriving rather than flashing.
- **Live numbers on the landing page**, computed from the institution's own record with
  the same small-cell suppression the transparency page uses. A friendlier surface must
  not be a looser one.

Every animation is decoration over a layout that already works. Strip the whole motion
layer and the page still renders, still submits, and still reads correctly in a screen
reader. `prefers-reduced-motion` collapses all of it, including the view transitions,
because a vestibular disorder is not a preference setting.

## The 2026 layer: AI and agents

A 2019 complaint portal could not have done any of this. The obvious 2026 move is a chat
box, and it is also the fastest way to destroy the only asset this product has: a record
that is defensible. A student whose ragging complaint was closed by a language model has a
second, worse grievance, and this time the institution has no defence.

So the AI here is deliberately unglamorous. It reads and suggests. It never writes a
decision. Four rules, argued in full in [ADR-0002](docs/decisions/0002-ai-and-agents.md):

1. **Off by default.** No `AI_PROVIDER` means a local, deterministic, no-network provider.
   Every feature still works, slightly worse.
2. **Nothing decides.** A human sets every status. There is no code path where a model
   changes an outcome.
3. **Every suggestion is auditable.** Provider, model, confidence, and what it said.
4. **Text is redacted before it leaves the machine.** Names, roll numbers, phones,
   Aadhaar, PAN. Point `AI_BASE_URL` at a box in the college's own server room.

**Urgency detection runs locally, always.** Ragging, harassment, threats, risk to life,
injury, safety hazards. It cannot be switched off by leaving a model unconfigured, and a
model is never allowed to clear a flag it raised. A false positive costs an officer a
glance. A false negative is a ragging report sitting behind a library card complaint for
two days. Those are not comparable, so the list is broad on purpose.

**Category suggestion** withholds itself below 0.45 confidence, because a wrong
pre-selection gets accepted by a tired moderator and ends up in the compliance report.

**Clustering is the genuinely new capability.** Forty students report the same mess
problem, forty officers write forty remarks, and the compliance report shows forty
closures and a healthy median. Nobody writes the sentence that matters: *the mess has a
problem*. The officer console now surfaces those groups. Term overlap rather than
embeddings, because a few hundred open grievances is microseconds of Jaccard and no GPU.

### The agentic part

`npm run agents:run` sweeps for breached deadlines, escalates up the UGC ladder, queues
notifications, and writes an audit event per action. Its authority is exactly three verbs:
**escalate, notify, record.**

It cannot close a grievance or set a status a human owns. An agent that could resolve
cases would be the fastest route to a clean compliance report, and a clean report nobody
earned is the exact fraud this system exists to make hard. There is a test asserting it
leaves status untouched, and another asserting a second sweep escalates nothing twice.

Every action it takes appends to the same hash chain a human action would, with `actorId`
null and the agent named in the payload, because "the system escalated it" has to be as
auditable as "the Registrar escalated it".

## Architecture

Next.js 16 App Router, Server Components throughout. No client-side data fetching anywhere. Every
page calls the service layer, the service layer is the only thing that touches the database, and
the database does not trust the service layer either.

```mermaid
flowchart TD
    subgraph browser["Browser"]
        S["Student portal"]
        O["Officer console"]
        P["Public transparency"]
    end
    subgraph app["Next.js 16 · Server Components"]
        AC["_lib/actor.ts<br/>session + role gate"]
        SVC["lib/grievance/service.ts<br/>every mutation"]
        POL["policy.ts<br/>authz + state machine"]
        SLA["sla.ts<br/>statutory clock"]
        AUD["audit.ts<br/>hash chain"]
    end
    subgraph db["Postgres 17"]
        RLS["FORCE ROW LEVEL SECURITY"]
        TRG["append-only trigger"]
    end
    S --> AC
    O --> AC
    P --> SVC
    AC --> SVC
    SVC --> POL
    SVC --> SLA
    SVC --> AUD
    SVC --> RLS
    AUD --> TRG
```

### Tenancy, in four layers

Multi-tenant on one shared Postgres. Four layers, because any single one of them will eventually
have a bug and the cost of getting this wrong is the kind that ends a B2B product.

1. **Application scoping.** Every tenant query goes through `withTenant(institutionId, …)`.
2. **Transaction-local context.** `set_config('app.institution_id', …, true)`. That third argument
   is load-bearing. With `false` a pooled connection hands the next request the previous tenant.
3. **`FORCE ROW LEVEL SECURITY`** on all ten tables, so the policy binds the table owner too.
4. **A restricted runtime role.** `sincp_app` is `rolsuper = f`, `rolbypassrls = f`.

Cross-tenant access exists (the login lookup has to find a user before it knows their institution)
and it runs as a **different role on a separate pool**. Bypass is a property of the connection you
open, never of a setting the application can write. That distinction is not academic. It is
[bug #1 below](#three-bugs-that-only-running-the-thing-found).

### The audit chain

```
hash(n) = sha256( prevHash ‖ grievanceId ‖ seq ‖ type ‖ actorId ‖ remark ‖ payload ‖ createdAt )
```

Fields join with `U+001F`. Join them with nothing and `("ab","c")` hashes identically to
`("a","bc")`, which is a forgery primitive rather than a style nit, so there is a test for exactly
that case. Payload keys are sorted, because `JSON.stringify` follows insertion order and two
semantically identical payloads would otherwise produce different hashes and break a chain for no
reason.

Every mutation writes its event inside the same transaction as the state change. If the event
write fails, the state change rolls back. That atomicity is the compliance claim: there is no way
to change a grievance without leaving a link in the chain.

### The statutory clock

`due_soon` fires inside 20% of the window remaining, or 3 days, whichever is larger. A 30 day
Ombudsperson window therefore still warns with real time left, while a 5 day sensitive-category
override does not warn on day one. Both the queue filter and the row badge read that same
function, which they did not always do (see [bug #2](#three-bugs-that-only-running-the-thing-found)).

### Module map

```
src/
  db/schema.ts          12 tables; every tenant row carries institutionId
  db/client.ts          withTenant(), the only door into tenant data
  lib/grievance/
    policy.ts           authorisation and the state machine, in one file on purpose
    audit.ts            the hash chain
    sla.ts              statutory clock, Asia/Kolkata, calendar or working days
    service.ts          every mutation, each writing its event in the same transaction
  lib/auth/             scrypt, server sessions, CSRF, rate limiting
  lib/ai/               provider seam, redaction, triage, clustering
  lib/agents/           the SLA watchdog, bounded to escalate/notify/record
  app/(public)          landing · transparency · disclosures · status lookup
  app/(student)/my      file · track · withdraw · accept · appeal
  app/(staff)/staff     queue · case view · compliance dashboard
  app/(admin)/admin     users · categories · settings · security log
  app/(campus)          news · handbook
  proxy.ts              mints the CSRF cookie
drizzle/0001_rls.sql    policies, roles, append-only trigger
scripts/
  seed.ts               demo data that verifies its own chains and tenant scoping
  import-legacy.ts      imports a real 2019 cms.sql dump
  check-rls.mjs         asserts RLS is actually switched on
```

That file is `proxy.ts`, not `middleware.ts`, and the reason is worth knowing: **Next 16 renamed
the convention.** A file called `middleware.ts` is silently never invoked. No warning, no error.
It presents as "CSRF fails on every form" with absolutely nothing in the logs, which cost me a
confused twenty minutes until I read the version's own docs instead of trusting what I already
knew.

## Tech stack

| Layer | Choice | Why this one |
|---|---|---|
| Framework | Next.js 16, App Router | Server Components mean the authorisation check and the query live on the same side of the wire |
| UI | React 19, Tailwind 4 (CSS-first `@theme`) | No `tailwind.config.js` in v4; tokens live in `globals.css` |
| Language | TypeScript strict, `noUncheckedIndexedAccess` | Catches the `rows[0]` that is actually `undefined` |
| Data | Drizzle ORM, Postgres 17 | Real SQL, real RLS, and migrations you can read |
| Auth | scrypt from `node:crypto`, server sessions | No dependency to keep patched, and it survives an air-gapped campus deployment |
| Validation | Zod v4 at every boundary | |
| Tests | Vitest, real Postgres for the integration half | |
| Deploy | Docker Compose, one command, behind their nginx | The buyer's IT admin is a lecturer on rotation |

## Getting started

```bash
cp .env.example .env.local
npm install
npm run db:up            # Postgres 17 in Docker
npm run db:push          # schema, then RLS policies, then asserts they are on
npm run db:seed          # 2 institutions · 20 users · 200 grievances · 911 events
npm run dev
```

Then <http://localhost:3000>. Every seeded account shares the password the seed prints at the end.

| Try | Account |
|---|---|
| The student view | `aarav.sharma@rit-bhopal.sincp.demo` |
| Triage queue | `anjali.rao@rit-bhopal.sincp.demo` (moderator) |
| Officer console | `suresh.iyer@rit-bhopal.sincp.demo` |
| Appeals | `ramesh.chandran@rit-bhopal.sincp.demo` (ombudsperson) |
| Users, categories, settings | `meera.joshi@rit-bhopal.sincp.demo` |

The seed builds **two** institutions on purpose. Cross-tenant isolation should be something you
can try to break, not something you have to take my word for.

## Compliance, cited

[**docs/compliance.md**](docs/compliance.md) maps every regulatory requirement to where
this product actually stands, with a link on every claim and the gaps named rather than
omitted. The short version:

**Built:** the UGC 2023 grievance flow end to end, statutory clocks, the Ombudsperson
appeal tier, published disclosures, a tamper-evident record.

**Three statutory tracks, not one queue.** NAAC 5.1.4 says *including sexual harassment
and ragging cases*, and those are governed by different laws with different committees. So
`grievances.track` is `sgrc`, `icc` or `anti_ragging`, and the track decides who may see a
case **at all**, before any per-record question is asked.

For an ICC case under the PoSH Act 2013, the answer is the Internal Complaints Committee
and nobody else: not the moderator who triages everything, not the Registrar, not the
Ombudsperson. Enforced in two places because they fail differently. `canView` gates a
record once you hold one; `accessibleTracks` builds the `WHERE` clause for every list
query, because a per-record check does not protect a list endpoint and without it the
officer queue would hand a moderator every ICC complaint in the institution.

The seed creates two ICC cases and a committee member, so you can try to break it rather
than believe it. Eight integration tests run the real query layer against a real database
and check the things a per-record test cannot: that ICC cases are absent from the queue
*total* and not merely off the page, and that guessing the category id does not get you
around the gate.

Reading the regulation also found a bug. The clause says the SGRC reports *"preferably
within a period of **15 working days**"*
([source](https://webstor.srmist.edu.in/web_assets/downloads/2023/ugc-redressal-2023.pdf)),
and the SLA engine was counting calendar days. That understates the deadline by about a
week once weekends are in, which in a compliance product means reporting breaches that
never happened. `slaUseWorkingDays` now defaults to true.

**Two free alternatives exist and you should know about them.**
[UGC e-Samadhaan](https://samadhaan.ugc.ac.in/) is the national escalation portal: a
complaint reaching it is one your own process did not catch, and the regulation separately
requires institutions to run their own. [Samarth eGov](https://samarth.edu.in/) is a
Ministry of Education ERP with a grievance module, free, and already installed across
central universities, which is a concrete reason to sell to private institutions rather
than government ones. The full landscape is in [docs/gtm/market.md](docs/gtm/market.md).

## Prove it yourself

```bash
./docs/verification/run.sh
```

Stands up a throwaway Postgres, applies the schema and the policies, and runs eight checks:
per-tenant visibility, fail-closed with no tenant context set, IDOR by explicit UUID, the
privileged-role escape hatch, and append-only enforcement against both `UPDATE` and `DELETE`.
Method and results: [**docs/verification/tenant-isolation.md**](docs/verification/tenant-isolation.md).

The append-only checks deliberately run **as the table owner**. Running them as the unprivileged
role proves nothing, because the `REVOKE` stops the statement before the trigger is ever reached.
The first version of that suite made exactly that mistake and got a confident, meaningless pass.

## Three bugs that only running the thing found

Every one of these read correctly, reviewed fine, and was wrong. I am documenting them because the
pattern matters more than the individual defects: **verify that a guard fires, not that it is
configured.**

**1. The RLS bypass could grant itself.** The policy keyed off `current_setting('app.bypass_rls')`.
Any role can write its own settings. So the application role could run
`SELECT set_config('app.bypass_rls','on',true)` and read every institution in the database. One
statement. The entire argument for having RLS is defence against an application bug, and I had
built a bypass reachable from the application. It now keys off `pg_has_role(...)`, which
`sincp_app` cannot grant itself, and the identical attack returns zero rows.

**2. `drizzle-kit push` silently disables RLS and drops every policy.** It recreates tables to
apply schema changes, and the flags and policies do not survive that. Nothing errors. Nothing
looks broken afterwards, because application-level scoping still filters correctly and every page
renders the right rows. Measured across one push: `relrowsecurity` true → false, policies 1 → 0.
`npm run db:push` now chains `db:rls` and `db:check-rls`, so a push cannot leave the database
undefended.

**3. Login was completely broken under RLS, and I demoed it working anyway.** `sessions` is a
tenant table, but `session.ts` queried it with the unscoped client, so `createSession` hit
`new row violates row-level security policy`. It went unnoticed for an embarrassing reason: I had
demonstrated login working *while RLS was accidentally switched off by bug #2*, then re-enabled
RLS and never retested. A working demo on a database with its security layer disabled. An
adversarial review caught it by reading the policy; I confirmed it by actually running the login.

If you take one thing from this repository, take that. Reading code tells you what it is supposed
to do. Only running it tells you what it does.

## What's real and what isn't, honestly

- **Grievance lifecycle end to end** (file, triage, assign, remark, resolve, close, withdraw,
  appeal). Real, covered by tests, and driven through the browser during development.
- **Tenant isolation, the audit chain, the append-only trigger.** Real, and verified firing against
  a live Postgres 17, not asserted. See [Prove it yourself](#prove-it-yourself).
- **The SLA engine.** Real, including working-day mode and the Asia/Kolkata handling, with an
  hour-by-hour sweep test asserting the badge and the queue filter agree across an entire window.
- **The legacy importer.** Real, and verified against the genuine 2019 `cms.sql` (22 complaints,
  5 remarks). Not run against a production deployment, because there isn't one.
- **News and handbook.** Real and working, deliberately shallow. No scheduling, no revisions,
  no workflow.
- **Attachments.** Real storage, sniffing, caps and authorisation. Local disk driver only. S3 is
  a documented seam, not an implementation.
- **Notifications.** Real. Filing, assignment and status changes queue a message in a
  transactional outbox, drained by `npm run notify:send`. Two transports ship: stdout for
  development, and a small SMTP client written directly against `node:net`/`node:tls`
  rather than pulling in a mail library to say `MAIL FROM`. Delivery is at-least-once
  with a dedupe key, five attempts, then dead-lettered. Not yet run against a real relay.
- **SSO: not built.** There is a seam for OIDC, nothing behind it.
- **AI assist.** Real, and off by default. Urgency detection and clustering need no model
  at all. Category suggestion improves with one. Never tested against a hosted provider,
  only against a local OpenAI-compatible endpoint and fakes.
- **The urgency keyword list is English-only.** A grievance in Hindi or Hinglish will not
  trip it, which is a real gap for this market and is on the roadmap rather than solved.
- **The watchdog has no true dry-run.** `--dry` prints a warning telling you to run
  against a copy of the database instead.
- **Malware scanning on uploads: not built.**
- **Rate limiting.** Real, with two stores. In-process memory by default, and a shared
  Postgres store (`RATE_LIMIT_STORE=postgres`) for when a second app container appears.
- **Screenshots in this README: not captured yet.**
- **PoSH / ICC routing.** Built, and the confidentiality is enforced in two places rather
  than promised. The committee's own inquiry workflow (statements, witnesses, findings) is
  not built. See [compliance.md](docs/compliance.md).
- **Anti-Ragging Committee as a distinct statutory body: partial.** The track exists with
  a short clock and a triage bypass. The committee and squad workflow do not.
- **Retention, per-student erasure and breach notification: not built.** All three are
  DPDP obligations on the institution running this.
- **A paying customer, or a pilot, or a design partner: none.** This is the artefact you take
  to the first Registrar conversation, not evidence that the conversation went well.

## Migrating a real 2019 deployment

```bash
npm run db:import-legacy -- --sql ./cms.sql --institution <uuid>            # dry run
npm run db:import-legacy -- --sql ./cms.sql --institution <uuid> --commit
```

Three refusals worth defending:

**md5 hashes are not migrated.** Carrying them across would import the vulnerability along with
the data. Every imported user arrives deactivated and must reset. This makes go-live day noisy and
it is still the right answer.

**No SLA is back-dated.** An imported grievance gets `dueAt = null` rather than an invented
deadline. Fabricating a statutory due date for something filed in 2018 would inject fictional
breaches into the very first compliance report, which is the precise opposite of the point.

**An unrecognised status becomes `submitted` rather than being dropped.** Misfiling a grievance is
recoverable. Losing one is not.

> The parser passed every test I wrote against synthetic SQL, then failed the moment I pointed it
> at the real dump: genuine data contains `complaintType = ' Complaint'` with a leading space, and
> my `.trim()` was quietly rewriting imported records. Test against the artefact you actually
> have, not the tidy one you invented.

## Testing and quality

```bash
npm test              # 271 unit and integration
npm run test:e2e      # 8 steps through a real browser (needs the app running)
npm run audit         # fails on a high or critical advisory
npm run typecheck     # strict, noUncheckedIndexedAccess
npm run db:check-rls  # asserts RLS is enabled, forced, and policied
```

Most run anywhere. About a quarter talk to a real Postgres deliberately, because RLS, the
append-only trigger and cross-tenant behaviour are database behaviour and a mock of them would
assert nothing at all. Without a database those suites **skip with a message naming the command to
run**, so a fresh clone never greets you with five red files.

`npm run test:e2e` drives a real browser through the whole thing: public pages without a
session, a protected route redirecting, an officer signing in, the queue ordered by breach
urgency, a status change appearing as a new link in the chain, and a student unable to reach
the officer console. Three of this repository's past bugs would have been caught there and
nowhere else, because all three type-checked and passed every other test.

Worth calling out: the illegal-transition matrix, a student trying to act on another student's
grievance, chain integrity across a full lifecycle, the concurrent-append retry, small-cell
suppression, magic-byte rejection, path traversal, and a sweep that walks an entire SLA window
hour by hour asserting the badge agrees with the queue filter.

## Security posture

Full threat model, the verified evidence, and **eight named open gaps** in
[**docs/security.md**](docs/security.md). A security document that lists no gaps is not a credible
one, so: no malware scanning, in-memory rate limiting, no SSO, no field-level encryption at rest,
no MFA, pool-reuse tenant inheritance argued rather than directly tested, no dependency scanning
in CI, and undefined attachment retention.

## Commercial material

[`docs/gtm/`](docs/gtm/) carries the parts that are not code: a twelve-question
[audit-readiness self-check](docs/gtm/audit-readiness-checklist.md) written to be useful
whether or not anyone ever buys this, a [targeting method](docs/gtm/target-list.md) built on
public NAAC and AISHE data rather than an invented list of names,
[first-touch messages](docs/gtm/outreach.md) that ask for a conversation instead of a demo,
plus ICP and positioning, pricing
(₹75,000 scoped pilot rising to ₹1.5L to ₹3L a year, priced per institution and never per
grievance, because per-grievance pricing pays a college to suppress filings), a 90 day launch plan
with explicit kill criteria, a pilot proposal a Registrar could actually sign, and straight
answers to the ten objections that will genuinely come up.

## Roadmap

- [ ] A flow GIF of one grievance end to end
- [ ] The ICC's own inquiry workflow: statements, witnesses, findings, the 3-month filing limit
- [ ] Anti-Ragging Committee and squad workflow, plus a link to antiragging.in
- [ ] Retention policy, per-student erasure, and breach notification for DPDP
- [ ] e-Samadhaan reconciliation, so UGC-forwarded complaints match internal cases
- [ ] Hindi and Hinglish urgency detection
- [ ] A real no-write dry run for the watchdog
- [ ] Run the SMTP transport against a real college relay
- [ ] Malware scanning before an upload becomes downloadable
- [ ] OIDC and SAML through the existing seam
- [ ] `pgcrypto` field-level encryption on grievance bodies
- [ ] Retention and legal-hold policy for attachments
- [ ] A design-partner pilot. The highest-probability failure here was never technical.

## Credits

The 2019 original was **Siddharth Pandalai**, **Nashit Shayan Khan**, **Nalin Gupta** and **Albin
Thomas**, at MANIT Bhopal. The idea, the three pillars and the escalation ladder in the SRS are
theirs. Aage kya karoge? Turns out: this. The 2019 code has been entirely replaced, but the
project it was trying to be is what got built.


## Documentation

| | |
|---|---|
| [architecture.md](docs/architecture.md) | Why the boundaries sit where they do, and what breaks if you move them |
| [glossary.md](docs/glossary.md) | SGRC, ICC, IQAC, NAAC, AISHE, PoSH, DPDP. Read this first if the domain is new |
| [compliance.md](docs/compliance.md) | Every regulatory requirement, with a link on each claim and the gaps named |
| [security.md](docs/security.md) | Threat model, verified evidence, eight open gaps |
| [design-language.md](docs/design-language.md) | The two registers, tokens, motion rules, and how to add a screen |
| [testing.md](docs/testing.md) | Three tiers, what is deliberately untested, and why |
| [operations/runbook.md](docs/operations/runbook.md) | For whoever is on the phone when it breaks |
| [migration-from-2019.md](docs/migration-from-2019.md) | Construct by construct, and the data path |
| [decisions/](docs/decisions/) | ADR-0001 product and architecture, ADR-0002 what AI may do |
| [verification/](docs/verification/) | Evidence that the guards fire, and the script that proves it |
| [gtm/](docs/gtm/) | Positioning, pricing, targeting, outreach, objections, market |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, house rules, the four things not to break |

## Licence

AGPL-3.0. See [LICENSE](LICENSE).
