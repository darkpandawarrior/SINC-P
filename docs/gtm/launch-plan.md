# 90-Day Launch Plan

## The core bet, stated plainly

The thing most likely to kill this ships perfectly and sits on a shelf: a polished product
with no adopting college (ADR-0001 Q4/Q5, luna's dissent, which the ruling explicitly
says is not yet fully answered). This plan is built around forcing that risk to surface
early, in week 2, not in week 10 after the product is "finished."

The alma mater deployment is the free lighthouse reference. It proves the product works
end-to-end on a real institution's real grievance data and gives every subsequent sales
conversation a working demo instead of a pitch deck. It is not revenue, and it must never
be treated as a proxy for revenue. A free deployment succeeding tells you nothing about
whether a Registrar who has to sign a PO will actually pay. Revenue comes only from
private tier-2/3 colleges, and only they can bypass the 9-18 month government tender cycle
that would outlast any solo-engineer runway (ADR-0001 Q5). Government and aided colleges
are explicitly not a week-1-through-90 target for that reason; the tender clock does not
fit inside this plan.

## Week by week

**Weeks 1-2: Design partner outreach, before more building.**
Identify 15-20 private tier-2/3 engineering colleges matching the ICP in `positioning.md`
(AICTE-approved, 1,000-8,000 students, NAAC/NBA cycle due within 18 months, no dedicated
grievance software). Get warm introductions to the Registrar or IQAC Coordinator wherever
possible: cold outreach to a Registrar's office has a low hit rate. Alumni and faculty
networks are the fastest path in. Run the design-partner interview (script below) with as
many as will take the call. Target: 8+ completed interviews by end of week 2.

This is the week that produces or kills the thesis. If fewer than 3 of 8 interviews
surface a Registrar or IQAC Coordinator who volunteers, unprompted, that grievance
tracking is a real pain during accreditation prep, stop and reread the kill criteria
below before building anything further.

**Weeks 3-4: Alma mater deployment.**
Deploy to the alma mater in parallel with interviews continuing. This is the reference
build: real data migration from whatever they currently use, real SGRC and officer
accounts, a real walkthrough with whoever plays the IQAC Coordinator role there. Every
rough edge found here (a migration step that breaks on real data, a workflow the officer
console makes harder instead of easier) gets fixed before it is shown to a paying
prospect. Produce one screen-recording demo and one before/after write-up (audit-week
scramble vs one-click export) from this deployment. These become the sales assets for
weeks 5 onward.

**Weeks 5-8: First paid pilot conversations.**
Take the alma mater demo back to the strongest 3-5 interviews from weeks 1-2. Pitch the
₹75,000 scoped pilot (`pricing.md`), not the year-1 subscription. The pilot is the
low-friction, single-signature purchase designed to close fast (`pricing.md`'s procurement
note). Target: 1 signed pilot by end of week 6, a second in flight by week 8. If zero
pilots have closed by week 8 despite 5+ serious conversations, that is a kill-criteria
trigger, not a reason to keep pitching the same way harder.

**Weeks 9-12: Run the first pilot, keep prospecting.**
Deliver the 6-week pilot scope end to end for the first signed college while continuing
outreach to the next 5-10 prospects from the original list plus any new warm
introductions the alma mater or pilot-college relationships surface. The pilot's
end-of-engagement compliance-readiness report is the artefact that either converts to a
year-1 subscription or tells you clearly why it didn't. Target by day 90: one completed
pilot with a documented outcome (converted, or a specific, named reason it didn't), and a
qualified pipeline of at least 5 more colleges who have seen the demo and expressed real
interest, not politeness.

## Design-partner interview script

Purpose: find out whether the compliance pain is real and urgent for this specific
person, without pitching yet. 20-25 minutes, Registrar or IQAC Coordinator, in person or
video, never by email. The hesitation and specificity in how someone answers these
matters as much as the words.

1. "Walk me through what happens right now when a student files a complaint or
   grievance, from the moment it lands to the moment it's resolved." (Listen for: does
   an actual defined process exist, or is this improvised per-case. Improvised is the
   strongest signal.)
2. "When was your last NAAC or NBA visit, and what did they ask to see about grievance
   handling?" (Listen for: specific document requests, specific gaps found last time.)
3. "How do you currently produce that record, could you show me, if you have it open?"
   (This is the moment that either surfaces a spreadsheet with visible problems, or
   reveals there is no consolidated record at all. Either answer is useful; a confident
   "we have a great system" that turns out to be a shared Google Sheet updated
   inconsistently is the most common real answer.)
4. "How long did it take to pull that together for the last accreditation visit?" (This
   quantifies the audit-week scramble cost from `positioning.md`. Get a number in days
   or hours, not a vague "a while.")
5. "Has a grievance ever been handled and then someone couldn't find the record of it
   later, during a visit, a parent complaint, a legal question?" (This is the sharpest
   qualifying question. A yes with a specific story is a strong buy signal. A confident
   "never happened" from someone who has not actually checked is a weak one.)
6. "If something like this existed and just worked, whose job would get easier, and by
   how much?" (Get them to name a role and a time saved, not agree with a leading premise.)
7. "Who else would need to sign off before you could bring in a tool like this?" (Surfaces
   the real procurement path and the single-signature threshold from `pricing.md` before
   it becomes a surprise mid-pilot.)

Do not pitch the product during this call unless asked directly. The goal is an honest
read on pain, not a sale. Write down the exact words used for the pain, if any: they
become the pitch language for that college's own Registrar conversation later, because a
Registrar's own phrase for the problem lands harder than the vendor's phrase for it.

## Kill criteria

These are the specific, named results that mean stop building and reposition, decided in
advance so a bad week does not get rationalised into "just needs more time":

1. **Fewer than 3 of the first 8 design-partner interviews surface unprompted, specific
   pain** (a real story like question 5 above, not polite agreement with a leading
   question). This means the compliance angle is not the felt pain the council's Q1
   ruling assumed, and the positioning needs to be re-examined before any more building.
2. **Zero paid pilots close by week 8** despite 5+ serious post-demo conversations with
   colleges that showed real interest at the interview stage. This means either the price
   is wrong, the buyer identified in `positioning.md` is not actually the decision-maker,
   or the demo does not close the gap between "interesting" and "worth a signature", and
   it needs a specific answer, not a generic "sales takes time."
3. **The alma mater pilot itself does not reduce the audit-week scramble.** If the
   before/after comparison from weeks 3-4 does not show a real, demonstrable time
   reduction versus their prior process, the core value proposition has not been proven
   even on friendly, fully-cooperative home turf, and it will not survive contact with a
   skeptical paying customer.
4. **The signed pilot college does not convert to year 1**, and the specific reason given
   is about the product (missing capability, wrong workflow) rather than budget timing or
   an unrelated institutional event. A budget-timing "yes but not this fiscal year" is not
   a kill signal. A "this doesn't actually solve what we needed" is.

Hitting one of these by its stated deadline is the trigger to stop and re-run the Q1/Q2
positioning question from ADR-0001 with fresh evidence, not to quietly extend the
timeline and keep going.
