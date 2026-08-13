# Building the target list

**What this is not:** a list of colleges. I am not going to hand over twenty institution
names with invented accreditation dates next to them, because the first Registrar who
notices that their NAAC cycle is listed wrong stops reading, and rightly.

What follows is the method, the public sources the real data comes from, and a scoring
rubric. An afternoon of work produces a list of forty that is actually true, which beats
a list of twenty that sounds true.

---

## The profile, restated

From `positioning.md`: private, self-financed or deemed institutions, roughly 1,000 to
8,000 students, in or approaching an accreditation cycle.

The two filters that matter most are not size or discipline. They are:

**Can this institution sign for ₹75,000 without a tender?** Private and deemed
institutions usually can. State and centrally funded ones usually cannot, and the
9 to 18 month procurement cycle outlasts any runway a solo founder has. This is why the
alma mater is a reference deployment and not the revenue plan.

**Is there a dated reason to care this year?** An accreditation cycle with a visible end
date turns a good idea into a deadline. Without one, grievance tracking is a project for
next year, permanently.

---

## Where the real data is

All public, all free, none of it requiring a scraper.

| Source | What it gives | Notes |
|---|---|---|
| NAAC's institution search on `naac.gov.in` | Accredited institutions, grade, and the validity period | The validity end date is the single most useful field in this entire exercise |
| AISHE (`aishe.gov.in`) | AISHE code, institution type, enrolment, state, management (private/government/aided) | The AISHE code is the natural external key, and `institutions.aisheCode` in the schema exists for exactly this |
| NBA (`nbaind.org`) | Programme-level accreditation and validity | Engineering colleges often hold NBA at programme level and NAAC at institution level |
| UGC lists | Deemed universities, private universities by state | Confirms the management type AISHE reports |
| The institution's own site | The SGRC page, the Ombudsperson, the grievance procedure | If this page does not exist or is a dead link, that is signal, not an obstacle |

Cross-check management type between AISHE and the UGC list before you trust it. They
disagree often enough to matter, usually where an institution changed status.

---

## Scoring

Score each candidate out of 10. Anything at 7 or above goes on the call list.

| Points | Criterion | Why it predicts a sale |
|---|---|---|
| 3 | NAAC or NBA validity expires within 18 months | A dated forcing function. Nothing else on this list moves a Registrar as reliably |
| 2 | Private, self-financed, or deemed | Can sign without a tender |
| 2 | Enrolment 1,000 to 8,000 | Big enough that grievances are a real volume, small enough that nobody has built something internal |
| 1 | No published SGRC page, or a broken link to it | A visible, checkable gap against a published requirement |
| 1 | A warm path in: alumni, faculty contact, a shared supervisor | Multiplies the reply rate more than any other single factor |
| 1 | Multiple campuses or a hostel-heavy population | More grievance surface, and hostels generate the categories nobody wants surfacing late |

**Worked example, using invented values to show the arithmetic:**

> Example Institute of Technology. NAAC A validity ending March 2027 (3). Self-financed
> (2). 3,400 students (2). SGRC page returns 404 (1). No warm path (0). Single campus
> with two hostels (1). **Total 9.** Goes on the list, high priority, cold approach.

Score twenty and the ordering will usually be obvious. The 9s and 8s are worth a
personal approach; the 7s are worth an email.

---

## Sequencing

**Tier 0, the reference.** The alma mater. One institution, deployed free, in exchange
for a case study and a testimonial. Not revenue, and treating it as revenue is how the
relationship gets spent on the wrong thing.

**Tier 1, warm.** Anywhere an alumni or faculty path exists. Ten to fifteen names. These
convert at a rate cold outreach does not approach, and the interview script in
`launch-plan.md` runs best here because people take the call as a favour.

**Tier 2, cold, scored 8 or above.** Twenty to thirty names, worked with the
audit-readiness checklist as the opener rather than a demo request.

**Tier 3, everything else.** Do not work this list until a pilot has closed. A wider
funnel does not fix a thesis that has not been validated, it just costs more to be wrong.

---

## What disqualifies a candidate

- Government or centrally funded, unless a specific person is actively asking. The
  procurement cycle is the problem, not the interest.
- Already running an ERP with a grievance module they use. Displacing a working incumbent
  is a different and much harder sale than replacing a spreadsheet.
- Fewer than about 800 students. The pain is real but the budget line is not, and a
  ₹75,000 pilot stops being a discretionary signature.
- No accreditation event within two years and no observation from the last one. Nothing
  is forcing a decision, and the conversation stalls politely and permanently.

---

## An honest note on this document

Every institution-specific fact needed to use this belongs to the person building the
list, from the sources above, on the day they build it. Accreditation validity moves.
Institutions change management type. Enrolment figures lag by a year in AISHE.

A target list is perishable. The rubric is not.
