# Pricing

## The numbers

| Stage | Price | What it buys |
|---|---|---|
| Pilot | ₹75,000, one-time, scoped to 6 weeks | Full deployment on the college's infrastructure (or ours, their choice), data migration from their existing register/spreadsheet, SGRC and officer training, and a compliance-readiness report at the end. See `pilot-proposal.md` for the exact scope. |
| Year 1 subscription | ₹1.5L–3L / year, priced per institution | Full product, all three pillars, unlimited users and grievances, one production deployment, the monthly compliance report, and support. |
| Renewal | Same band, renegotiated at renewal against actual usage and headcount | No surprise step-function increases; the point of year 1 is to prove value at a price the college already budgeted for. |

Where in the ₹1.5–3L band a given college lands depends on student count (1,000 vs 8,000
is a real difference in support load) and whether they want self-hosted or us-hosted. This
is the one deliberately soft number in the whole document. It gets fixed per deal, not
set by a formula, because the pilot conversation reveals which factors actually matter for
that college.

## Priced per institution, never per grievance

This is the one pricing rule that is not up for negotiation, and it needs to be said out
loud to a buyer who will otherwise propose it: never charge per grievance filed, per
complaint resolved, or any other usage metric tied to complaint volume.

The reasoning is not about revenue predictability, though that is a real side benefit. It
is that per-grievance pricing puts the vendor's financial interest directly against the
product's entire reason for existing. A Registrar who is charged more for more complaints
has a standing incentive to make filing harder, discourage students from using the
channel, or quietly lean on the SGRC to close things off-system. That is exactly the
failure mode the whole compliance case is built to prevent. See ADR-0001's accepted
dissent on why a grievance register nobody files into is worse than useless: it is a
fabricated clean record. A pricing model that rewards suppression is incompatible with
selling an audit trail. Per-institution, flat, volume-independent pricing is the only
structure that keeps the vendor's incentives pointed the same direction as the product's
purpose.

## Why there is no free tier

The council split 6-to-1 on this, and the dissent (open-source the core under AGPL as a
trojan horse into the market) was withdrawn by its own author as more than one engineer
can support. The remaining 6 agreed on the reasoning, and it holds:

A free tier signals "student project, unsupported." The buyer here is not evaluating
software on features first. They are evaluating who they can hold responsible when a
grievance is mishandled and a parent, a student union, or an NAAC inspector asks why. A
free product has an implicit answer to "who do I call when this breaks": nobody. That
answer is disqualifying for a compliance purchase regardless of how good the product is,
because the entire point of the purchase is to have someone accountable.

This is a credibility signal, not a revenue-maximisation decision. The pilot price itself
(₹75,000) is set deliberately not-cheap for the same reason. See the rejected-bottom
note below. A tier-2/3 college that has never bought software like this before is reading
the price as a proxy for seriousness before they have evaluated a single feature.

## What is in each tier

**Pilot (₹75,000, 6 weeks):**
- Full product: grievance engine, statutory disclosure page, thin announcements surface.
- Migration of existing complaint history from spreadsheet or paper register, best-effort.
- SGRC member and department officer accounts, training session, and a walkthrough with
  the IQAC Coordinator on how to pull an accreditation-ready export.
- One deployment: on-prem Docker Compose behind their existing nginx, or hosted by us if
  they have no server to offer, their choice, no price difference.
- End-of-pilot compliance-readiness report: gaps found in their current SGRC process that
  the system now closes, framed for the Registrar to show upward.

**Year 1 (₹1.5–3L/year):**
- Everything in the pilot, ongoing, no seat limits, no grievance-volume limits.
- Monthly compliance report, generated and delivered, not a self-serve dashboard they have
  to remember to check. The sales motion here is "we hand you the report," not "here is
  software access," see the launch-plan note on this.
- Support: email/phone response within one business day, because the buyer's IT admin is
  a lecturer on rotation and cannot debug a Docker container at 11pm before a visit.
- Software updates and security patches applied by us on the self-hosted deployment, or
  automatically on the hosted one.

There is no separate "enterprise" tier in v1. A single institution north of 8,000 students
or asking for SSO/SAML on day one is priced as a custom deal against the OIDC seam
mentioned in ADR-0001, not a published tier. There are no reference customers yet at that
scale to justify publishing a number.

## The council's spread, and why the ends were rejected

The council proposed anywhere from ₹40,000 to ₹8,00,000 for the annual price. Both ends
were rejected for reasons that matter to anyone revisiting this later:

- **₹40k is too cheap to be credible.** Price is part of the signal, per the free-tier
  reasoning above. A number this low reads as "side project," which is disqualifying for
  the same reason a free tier is.
- **₹8L is unsupportable with zero reference customers.** That number assumes a sales
  motion (multi-stakeholder enterprise negotiation, a proof-of-value cycle measured in
  quarters) this product cannot yet support. It is a price for year 3, once the alma
  mater deployment and a handful of paying pilots exist as references, not for year 1.

## Procurement note: stay under the tender threshold

Private colleges are trusts or societies, not government bodies, so they are not bound by
GFR-style public-tender rules. But almost every private college finance office runs an
internal procurement policy modelled on the same idea: below some threshold, the Registrar
or Principal can sanction a purchase directly; above it, the purchase needs three
competitive quotations, a purchase committee, or full Trust/Board sign-off. That threshold
varies by institution, commonly somewhere in the ₹1–2L range for a single-signature
sanction at a mid-size private college, though this is a pattern observed across deals,
not a cited regulation, and must be confirmed with each buyer rather than assumed.

The practical consequence: the ₹75,000 pilot price is chosen to sit comfortably under
almost any college's single-signature threshold, so the Registrar can approve it without
convening a purchase committee. That is the entire point of pricing the pilot as a
standalone, low-friction purchase rather than folding it into the year-1 subscription.
It removes the single biggest source of sales-cycle delay (waiting for a committee to
meet) at the exact stage where speed matters most, before the college has any reason yet
to believe the product works.

The year-1 renewal, at ₹1.5–3L, may cross that same threshold at some colleges. By the
time that conversation happens, the pilot has already produced a compliance-readiness
report the Registrar can carry into a committee meeting as justification, so the
higher-friction approval path is timed to land only after there is already a concrete
result to point to, not before.
