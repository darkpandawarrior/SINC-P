# Contributing

## Setup

```bash
cp .env.example .env.local
npm install
npm run db:up && npm run db:push && npm run db:seed
npm run dev
```

`npm run db:push` chains the row-level-security re-apply and then asserts it worked. Run
the chained script rather than `drizzle-kit push` directly: a bare push silently disables
RLS and nothing tells you.

## Before you open a pull request

```bash
npm run typecheck   # tsc + the 'use server' guard
npm test
npm run build       # catches things tsc cannot, see below
```

`npm run build` is not optional. Two bugs in this repository's history passed typecheck and
every test and only appeared in a production build, both of them a `'use server'` file
exporting something that was not an async function.

## House rules

**Comments explain why, never what.** The code says what it does. A comment earns its place
by naming a trap, a rejected alternative, or a consequence that is not visible locally.

**No em dashes in prose.** Docs and comments are linted for voice. Use a full stop, a comma,
a colon, or parentheses.

**Shortest thing that works.** No abstraction with one implementation, no factory, no
config for a value that never changes. If you deliberately simplify, mark it:

```ts
// ponytail: in-memory limiter, move to Redis when we run more than one instance
```

**Non-trivial logic leaves a test behind**, and the test must fail without the fix. Trivial
one-liners do not need one.

## The four things not to break

1. **Every tenant query goes through `withTenant`.** No exceptions outside
   `withoutTenantScope`, which needs a stated reason and runs as a different role.
2. **Every grievance read is gated by `canView`**, and every status change by
   `canSetStatus`. Do not re-implement either.
3. **A state change and its audit event share one transaction.** If the event write fails,
   the state change must roll back.
4. **Nothing automated decides an outcome.** The AI suggests. The agent escalates, notifies
   and records. Neither sets a status. See [ADR-0002](docs/decisions/0002-ai-and-agents.md).

A per-record check does not protect a list endpoint. If you add an access rule, add it to
`canView` *and* to the `WHERE` clause in `_internal.ts`, and test both.

## Where things live

Read [docs/architecture.md](docs/architecture.md) first. [docs/glossary.md](docs/glossary.md)
if the acronyms are unfamiliar, which they will be unless you have worked in Indian higher
education. [docs/design-language.md](docs/design-language.md) before adding a screen.
[docs/testing.md](docs/testing.md) before adding a test.

## Claims

This repository's value is that its claims are checkable. If you state something in a
document, link the source or show the command that proves it. If a gap exists, name it
rather than omitting it: [docs/compliance.md](docs/compliance.md) lists what the product
does not do, on purpose.
