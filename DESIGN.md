---
version: alpha
name: SINC-P design system
description: A statutory compliance tool in two registers, calm for officers and warmer for the public.
# Mirrors the light theme in src/app/globals.css (@theme). If they disagree, the code wins.
colors:
  bg: "#f3f5f7"
  surface: "#ffffff"
  fg: "#14181c"
  fg-muted: "#4b5563"
  border: "#d1d5db"
  focus-ring: "#1d4ed8"
  primary: "#1e3a8a"
  on-primary: "#ffffff"
  error: "#b91c1c"
rounded: { sm: 0.25rem, md: 0.375rem, lg: 0.625rem }
---

# SINC-P DESIGN.md

> Inherits: house design standard (AgentHarness skill `design-md`). This file wins on conflict.
> Agents: read this before creating or changing any UI. Values live in `src/app/globals.css`
> (`@theme`, no tailwind config exists). The reasoning is in `docs/design-language.md`; this file
> is the short form and does not replace it.

Dial: ENERGY 3 / RHYTHM 4 / MOTION 2

## Overview

Two audiences who need opposite things. A Registrar working forty cases before an accreditation
visit needs calm, dense, printable. A student filing late at night about a real problem needs to
believe someone will read it. So the officer console keeps the calm palette, and public and
student surfaces opt into a warmer one with `data-surface="public"` on a wrapper. Same tokens,
same contrast floors, different emotional weight.

The reference is a well-run government form, not a SaaS landing page. Status colours never
change between registers: red means overdue everywhere.

## Colors

Source: `src/app/globals.css`. Two independent axes that compose: theme (light or dark, from
`prefers-color-scheme`, overridable with `[data-theme]`) and register (default or
`[data-surface="public"]`).

- Neutrals: `--color-bg`, `--color-surface`, `--color-fg`, `--color-fg-muted`, `--color-border`,
  `--color-border-strong`.
- Accent: `--color-accent` with `-fg`, `-hover`, and the soft trio (`-soft-bg`, `-soft-fg`,
  `-soft-border`). One accent per screen region, used for the primary action and selection.
- Status scale: `--color-status-{neutral,neutral-muted,info,success,success-strong,danger,escalate,warning}`
  each with `-bg`, `-fg`, `-border`. Six hue families cover eight statuses.
- Public register adds `--color-hope-1/2/3` and `--color-hope-soft` (see the `data-surface` block).

Colour is never the only signal: every status pairs hue with an icon and a text label. Small
chips use a light background with a dark foreground, not white on saturated. AA 4.5:1 is the floor.
Dark mode is defined twice on purpose (the media query and `:root[data-theme='dark']`), so the
manual toggle wins in both directions. Edit both blocks together.

## Typography

System font stack (`--font-sans`), no web fonts: the CSP blocks external requests and campus
wifi is slow. `text-balance` on headings, `text-pretty` on body, `tabular-nums` on any number
in a column or that updates. Uppercase tracking only on small labels.

## Layout

Officer console is dense: compact rows, visible grid, no zebra striping. Public surfaces breathe:
wider measure, larger type, more vertical rhythm. Wide tables scroll inside their own container,
never the page. Check at 320px wide and at 200% zoom.

## Elevation & Depth

One shadow token, `--shadow-card`, with a dark variant. Borders do most of the work. Print removes
shadows and goes white on black text, because the compliance dashboard ends up in a NAAC report.

## Shapes

`--radius-sm`, `--radius-md`, `--radius-lg` only. No other radii.

## Components

Small and unabstracted, in `src/components/ui/`: `Button`, `Badge`, `Card`, `Field`, `Table`,
`EmptyState`, `Alert`, `StatusPill`, `SlaBadge`, `SlaRing`, `Skeleton`, `Pagination`. Compose
with `cn()` (clsx + tailwind-merge); `cva` only for a real variant matrix. New components are
Server Components unless they need state. Every input wires `aria-describedby` and `aria-invalid`
with real hint and error elements, never placeholder-as-label.

## Motion

Tokens: `--duration-fast` (120ms), `--duration-base` (220ms), `--duration-slow` (420ms);
`--ease-out-quint`, `--ease-spring`. Animate `transform` and `opacity` only. Stagger caps at ten
steps. Every animation is decoration over a layout that already works. `prefers-reduced-motion`
collapses all of it, including view transitions.

## Do's and Don'ts

- Do give status an icon and a label, not just a colour.
- Do use the existing `:focus-visible` ring (2px, 2px offset); never remove it without replacing it.
- Do check a new screen with JavaScript disabled; a form that stops working is a design bug.
- Do keep officer screens on the default register and student or public screens on `data-surface="public"`.
- Don't use a status colour for anything but its status.
- Don't add web fonts, gradients as decoration, or a second accent.
- Don't animate layout properties.
- Don't hand-pick a hex in a component; use a token, or add one in `@theme` with its dark pair.

## Agent notes

- Next.js here has breaking changes: follow `AGENTS.md` and `node_modules/next/dist/docs/`.
- Gate: `npm run typecheck`, `npm run lint`, `npm test` (see `package.json`).
- Known gaps: no component-level token file beyond `globals.css`; print rules are described in
  `docs/design-language.md` only.

## Changelog

| Date | Change | Why | Source |
|---|---|---|---|
| 2026-10-09 | Initial version, distilled from the code token files and existing design docs | Establish design direction for agents | DESIGN.md rollout |

## Open questions

- Known gap: no component-level token file beyond globals.css; print rules only in docs/design-language.md.

## Evolving this file

Agents: when you change UI and find this file wrong or silent, fix it in the same change and add a Changelog row. Code token files win over this file; when they disagree, correct the doc. A user correction of a visual choice with a stated reason becomes a rule here immediately. Lessons that apply beyond this repo go to the LEARNINGS log of the `design-md` skill in AgentHarness.
