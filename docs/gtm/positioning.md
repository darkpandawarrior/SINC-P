# Positioning

## One-sentence positioning statement

For the Registrar of a private Indian engineering college facing a NAAC or NBA visit,
SINC-P is the statutory grievance-redressal system that produces an audit-ready record of
every complaint and its resolution time, because Excel, email, and a part-time clerk
cannot prove an SLA to an inspection committee.

## ICP

Private, self-financed engineering colleges in India. Tier-2/3 (not the IITs/NITs, not the
top-20 private brands; they already have ERP budgets and consultants). 1,000 to 8,000
students. Currently mid-cycle or approaching a NAAC or NBA accreditation visit, because
that is the deadline that turns "we should really organise this" into a signed PO.

Signals that a college is in-ICP:
- AICTE-approved, UGC-affiliated, private trust or society ownership.
- A NAAC cycle due within 18 months, or an NBA Tier-1/Tier-2 renewal on the calendar.
- No existing dedicated grievance software. They are on Excel, a shared Google Form, or a
  physical complaint register, with an SGRC that meets on paper more than in practice.
- An IQAC office that exists (UGC mandates it) but is understaffed, usually one
  coordinator doing this alongside a full teaching load.

Out of ICP: government/aided colleges (procurement cycle measured in years, see
launch-plan.md), colleges under 1,000 students (grievance volume too low to justify a paid
tool over a shared spreadsheet), and colleges that already run a full ERP with a grievance
module bolted on (Fedena, Academia) unless that module is visibly unused, worth checking,
because it usually is.

## Buyer, champion, user

**Buyer:** Registrar, or Dean of Student Welfare where that role exists separately. Holds
the budget line and signs the PO. Cares about one thing above all others: not being the
name attached to an adverse NAAC/NBA finding on grievance redressal. Time-to-resolution
data and SGRC compliance are line items in the accreditation report; a gap there is a
personal risk to this person, not an abstract institutional one.

**Champion:** IQAC Coordinator. Does the actual work of assembling evidence for
accreditation visits, and is the one who currently spends the week before a visit
manually reconstructing a grievance timeline from email threads and a register nobody
kept consistently. This is the person who feels the pain monthly, not just at
accreditation time, and who will push the Registrar to approve the purchase.

**Daily users:** the SGRC members and department-level grievance officers who currently
handle complaints by email and have no way to prove what they did or when.

**End beneficiary, not the buyer:** the student. Students file, but do not pay, and a
product pitched to students first (the 2019 mistake) has no budget behind it. The student
side matters commercially only because a grievance system nobody files into produces
zero rows to audit, see the published-statistics counter-pull in ADR-0001 Q1.

## The economic case against the incumbent

The incumbent is not a competitor's product. It is Excel plus email plus a part-time
clerk (or the IQAC coordinator moonlighting as one). The real cost of that setup, made
explicit, is what the pitch has to displace:

- **The audit-week scramble.** Every accreditation cycle, someone spends 3-5 working days
  before the visit reconstructing "which grievances came in, who handled them, how long
  did it take" from scattered email threads, a partially-updated spreadsheet, and
  institutional memory. That is a real person's paid time, spent once a cycle, doing work
  a system should have been producing continuously.
- **No defensible SLA.** UGC regulations expect time-bound resolution. Excel cannot
  timestamp a status change in a way that resists "we forgot to update the sheet, but we
  definitely handled it on time." An inspection committee that has seen this before does
  not take that on faith.
- **Silent loss.** A complaint that arrives by email and gets handled informally leaves no
  record at all. When the SGRC meets to report grievance numbers, the true count is
  higher than what shows up on paper, and there is no way to know by how much.
- **No student trust signal.** A student who cannot see that other complaints get
  resolved has no reason to believe filing is worth it, so they stop filing and escalate
  straight to the Grievance Ombudsperson, or worse, to social media. That is a
  reputational risk the Registrar owns.

None of this is expensive to fix in absolute terms. It is expensive in the specific
currency the buyer is short on during audit season: time, and defensibility.

## Competitive line

The honest competitive position is narrow, and claiming otherwise would get caught in the
first sales conversation.

**TCS iON, Fedena, Academia** are full campus ERPs: admissions, fees, attendance,
timetabling, library, and (usually) a grievance module bolted on as one feature among
forty. They win on integration breadth: one login, one vendor, one data model across the
whole campus. SINC-P does not compete there and should never claim to.

**What SINC-P owns instead:** the statutory grievance audit trail, built as the whole
product rather than as a checkbox feature inside a suite. That difference shows up in
three concrete ways an ERP's bolted-on module usually cannot match:
1. A hash-chained, append-only event log: the record is tamper-evident, not just
   editable-with-a-timestamp-column.
2. UGC-mandated statutory disclosures (SGRC composition, Ombudsperson contact,
   anti-ragging committee) built in as compliance artefacts, not a generic CMS page.
3. Deployment small and self-contained enough to run on the creaking on-prem server a
   tier-2/3 college's rotating-lecturer IT admin can actually operate, one Docker
   Compose command, no dependency on the rest of an ERP rollout succeeding first.

The pitch to a college already running (or being sold) a TCS iON or Fedena deployment is
not "replace it." It is: the grievance module in a general ERP is built to be adequate
across forty features, and this is built to be excellent at one, the one an NAAC/NBA
inspector actually reads line by line. Colleges that already have a full ERP and a
functioning grievance module in it are correctly out of ICP. The pitch only lands where
that module is unused or the college has no ERP at all, which is most of the tier-2/3
market.
