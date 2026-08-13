# Design language

The rules the interface follows, and the reasoning, so a second person can add a screen
that looks like it belongs.

Everything here lives in `src/app/globals.css` as tokens. There is no `tailwind.config.js`:
Tailwind 4 is CSS-first and the `@theme` block is the source of truth.

---

## The central decision: two registers

One product, two audiences who need opposite things.

**A Registrar working forty cases before an accreditation visit** needs calm, dense and
printable. Vibrance there is noise, and noise costs them accuracy on the one task the
institution is being judged on.

**A nineteen-year-old filing at 11pm about a hostel with no water** needs to believe
somebody will read it. Institutional grey tells them what every other college portal has
already told them, which is that this is a form that goes nowhere.

So the officer console keeps the calm palette, and public and student surfaces opt into a
warmer one by setting `data-surface="public"` on a wrapper. Same tokens, same contrast
floors, different emotional weight.

**What never changes between registers:** status colours. Red means overdue on every
screen, in both themes, in both registers. A colour that means one thing in the queue and
another on the landing page is worse than no colour.

---

## Colour

Two independent axes, and they compose:

| Axis | Values | Set by |
|---|---|---|
| Theme | light / dark | `prefers-color-scheme`, overridable by `[data-theme]` |
| Register | default / public | `[data-surface="public"]` |

Dark mode is defined twice on purpose: once under `@media (prefers-color-scheme: dark)`
guarded by `:root:not([data-theme='light'])`, and once under `:root[data-theme='dark']`.
The first respects the OS, the second lets a manual toggle win in either direction. Miss
the second and the toggle only works one way.

### The status scale

Six hue families cover eight statuses. Never doubling up on red/amber/green matters
because these appear as small chips at a glance.

**Colour is never the only signal.** Every consumer pairs it with an icon and a text
label, so the board still reads for someone with a colour vision deficiency. The SLA ring
carries a number for the same reason: "how late is this" is the question the product
exists to answer and it must never depend on distinguishing amber from red.

### Contrast

WCAG AA (4.5:1 for text) is a floor, not a target. Small status chips use a light
background with a dark foreground rather than a saturated background with white text,
because the latter fails at chip sizes more often than it looks like it will.

---

## Motion

Three durations and two easings, so unrelated things do not each invent their own timing.

```
--duration-fast   120ms   hover, focus, colour changes
--duration-base   220ms   entrances, panels
--duration-slow   420ms   the SLA ring filling
```

**Every animation is decoration over a layout that already works.** Strip the entire motion
layer and the page still renders, still submits, still reads correctly in a screen reader.
That is the test for whether an animation is allowed to exist.

Rules:

- Animate `transform` and `opacity`. Never animate anything that triggers layout.
- Row entrances stagger to a cap of ten steps. Past that the last row waits long enough to
  feel broken rather than considered.
- `prefers-reduced-motion: reduce` collapses everything to 0.01ms, including view
  transitions. This is not a preference toggle to respect when convenient: a vestibular
  disorder is a medical condition and the OS already asked on the user's behalf.

---

## Typography

System font stack, no web fonts. Two reasons: the CSP blocks external requests, and the
target user is often on campus wifi where a 200KB font is a second of blank text.

- `text-balance` on headings, `text-pretty` on body paragraphs.
- `tabular-nums` on anything numeric that sits in a column or updates. A day counter that
  shifts width as it ticks reads as broken.
- Uppercase tracking only on small labels, never on anything a person has to read twice.

---

## Layout

- The officer console is dense. Rows are compact, the grid is visible, and there is no
  zebra striping (it vanishes under a dark OS theme and returns as a bug report).
- Public surfaces breathe. Wider measure, larger type, more vertical rhythm.
- Wide content scrolls inside its own container. A compliance table must never push the
  page sideways on a laptop.

---

## Components

Small and unabstracted on purpose. `Button`, `Badge`, `Card`, `Field`, `Table`,
`EmptyState`, `Alert`, `StatusPill`, `SlaBadge`, `SlaRing`, `Skeleton`, `Pagination`.

`cn()` (clsx + tailwind-merge) rather than a variant library for most of them. `cva` is
installed and used only where a component genuinely has a variant matrix worth declaring.

### Fields

Every input is wired for `aria-describedby` and `aria-invalid`, with the hint and error
rendered as real elements rather than placeholder text. Placeholder-as-label is the single
most common accessibility failure in form-heavy products and this product is nothing but
forms.

### Focus

`:focus-visible` gets a 2px ring at 2px offset, defined once in `globals.css` for every
interactive element. Never remove it without replacing it. Officers navigate this by
keyboard all day.

---

## Print

The compliance dashboard ends up in a NAAC self-study report, so print is a real target
rather than an afterthought:

- Colour fields and skeletons are hidden.
- Shadows are removed.
- Background goes white, text goes black.

---

## Adding a screen

1. Decide the register. Officer console keeps the default; anything a student or the
   public sees gets `data-surface="public"`.
2. Use existing components. If a new one is needed, it goes in `src/components/ui/` and is
   a Server Component unless it genuinely needs state.
3. Status must carry an icon and a label, not just a colour.
4. Numbers in columns get `tabular-nums`.
5. Check it with JavaScript disabled. If a form stops working, the design is wrong.
6. Check it at 320px wide and at 200% zoom.
