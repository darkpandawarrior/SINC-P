# Testing strategy

What is tested, what deliberately is not, and why the split falls where it does.

```bash
npm test              # 272 unit and integration
npm run test:e2e      # 8 browser steps, needs the app running
npm run typecheck     # tsc + the 'use server' guard
npm run db:check-rls  # asserts row-level security is actually on
./docs/verification/run.sh   # 11 database checks against a throwaway Postgres
```

---

## Three tiers, three different jobs

### Pure (about three quarters)

No database, no network, run anywhere in milliseconds. `policy.ts`, `audit.ts`, `sla.ts`,
`redact.ts`, `clusters.ts`, `password.ts`, the SQL dump parser.

These carry the security-critical logic on purpose. Authorisation that is cheap to test
exhaustively gets tested exhaustively: `policy.ts` alone has 27 tests covering the
transition matrix, cross-tenant refusal, and ICC confidentiality. That is only affordable
because the module has no I/O.

### Integration (about a quarter)

Real Postgres, real RLS, real triggers. Tenant isolation, the append-only trigger, the
outbox, the SLA watchdog, ICC track scoping.

Mocking these would assert nothing. A fake that returns rows tells you your fake works. The
question is whether *Postgres* refuses the query, and only Postgres can answer it.

**Without a database these skip with a message** naming the command to run, rather than
failing. A fresh clone showing five red files reads as a broken repository, which is a
worse first impression than a skipped suite.

### End to end (8 steps)

A real browser against a real database: public pages without a session, a protected route
redirecting, an officer signing in, the queue ordered by breach urgency, a status change
appearing as a new link in the chain, a student unable to reach the officer console.

Three of this repository's past bugs would have been caught here and nowhere else, because
all three type-checked and passed every other test:

- login broken under RLS
- the CSRF cookie never minted, because `middleware.ts` is not invoked in Next 16
- `export const` in a `'use server'` file invalidating the whole module

---

## The rule the layers exist to encode

**A per-record check does not protect a list endpoint.**

`canView` guards a grievance you already hold. A list query never holds one: it builds a
`WHERE` clause and returns whatever matches. So every access rule needs testing twice, and
the second test has to count rows rather than inspect them.

`icc-track.test.ts` is the worked example. Two of its cases only make sense at that level:

- ICC cases are absent from the queue **total**, not merely off the current page. Filtering
  rows but not the count leaks the existence and number of sexual harassment complaints
  through pagination.
- Passing the ICC category id as a filter does not get a moderator around the gate.

Neither is expressible as a unit test of `canView`.

---

## Deliberately not tested

- **React rendering.** No component tests. The components are thin and Server-rendered, the
  logic lives underneath them, and the e2e suite covers whether a page actually works. A
  snapshot test of a `Badge` asserts that the markup is the markup.
- **Drizzle itself.** Testing that an ORM emits SQL is testing someone else's project.
- **The SMTP conversation.** The two risky parts, dot-stuffing and header sanitisation, are
  pure functions and are tested. Speaking SMTP to a socket is not.
- **Third-party model output.** The AI tests use fakes and assert how the code behaves when
  a model returns garbage, invents a category, or times out. Asserting what a model says is
  asserting the weather.

---

## Writing a new test

**Put it in the cheapest tier that can actually catch the bug.** A rule about who can see
what belongs in `policy.test.ts` *and* in an integration test if a list query can reach it.

**Assert the failure, not the success.** `expect(canView(...)).toBe(false)` for the role
that must not see it is worth more than three assertions about the role that must.

**Say why in a comment when the reason is not obvious.** Half the tests here carry one
line explaining the bug they exist to prevent, because a test whose purpose is forgotten
gets weakened the first time it fails.

**Never weaken a test to make it pass.** Both times that temptation appeared in this
repository the test was right and the code was wrong.

### The one that proved itself

The regression test for the SLA badge drift does not assert a value. It asserts that the
badge agrees with the queue filter, hour by hour across an entire window:

```ts
for (let hoursLeft = 0; hoursLeft <= windowDays * 24; hoursLeft += 1) {
  expect(computeSlaState(s, NOW)).toBe(expected)
}
```

The bug was invisible at most sample points and obvious in a sweep. When a rule must hold
continuously, test it continuously rather than at three convenient points.

---

## Coverage

Floor of 70% lines, 65% functions, 60% branches, enforced in CI. Real number is about 75%.

It is a floor, not a target. It exists to catch a pull request that adds a module and no
test, not to be chased upward. The security-critical modules are near-exhaustively covered;
the number is dragged down by the SMTP client and by glue that the e2e suite exercises
instead.

---

## Guards that are not tests

Three checks catch things no test would:

| Check | Catches |
|---|---|
| `check-server-actions.mjs` | `'use server'` files exporting non-async values. Invisible to TypeScript, only trips when a page renders. Has bitten twice |
| `db:check-rls` | Row-level security silently disabled, which `drizzle-kit push` does on every run |
| `docs/verification/run.sh` | Whether the database guards *fire*, as opposed to existing in a `.sql` file |

The last one is the important idea. A policy in a migration file and a policy active in the
database are different claims, and only one of them protects anybody.
