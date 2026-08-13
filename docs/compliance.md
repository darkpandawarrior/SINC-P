# Regulatory requirements, and where SINC-P stands against each

Every claim on this page carries a link. Nothing here is from memory, and where a
requirement is not met the row says so rather than being left out.

**Verify against the primary source before quoting any figure to a governing body.**
Regulations are amended, institutions differ, and a day count in a vendor's document is
not evidence. The links are the evidence.

---

## 1. UGC (Redressal of Grievances of Students) Regulations, 2023

Notified 11 April 2023 (Notification No. F.1-13/2022 (CPP-II)), superseding the 2019
regulations. This is the regulation the product is built around.

**The clause text, quoted from an institution's published reproduction of the
regulation** ([SRM Institute of Science and Technology](https://webstor.srmist.edu.in/web_assets/downloads/2023/ugc-redressal-2023.pdf)):

> "The SGRC shall send its report with recommendations, if any, to the competent
> authority of the institution concerned and a copy thereof to the aggrieved student,
> preferably within a period of **15 working days** from the date of receipt of the
> complaint."

> "Any student aggrieved by the decision of the Students Grievance Redressal Committee
> may prefer an appeal to the ombudsperson, within a period of **15 days** from the date
> of receipt of such decision."

> "The Ombudsperson shall make all efforts to resolve the grievance within a period of
> **30 days** of receiving the appeal from the aggrieved students."

Two further requirements, reported by
[Careers360](https://news.careers360.com/ugc-asks-universities-form-committee-appoint-ombudsperson-redress-student-grievances)
and reproduced in institutional policies such as
[GBPUAT's SGRC policy](https://gbpuat.ac.in/facility/Student_Grievance_Redressal/29.06.2024_SGRC_Policy_link.pdf):

- Each institution must have **an online portal** where an aggrieved student may submit
  an application seeking redressal, within three months of the notification.
- On receipt of an online complaint, the institution refers it to the appropriate SGRC
  **with its comments within 15 days**.
- The Ombudsperson must be a retired vice-chancellor, a retired professor with ten years
  of experience, or a former district judge.

### What this changed in the code

The 15 days for the SGRC report are **working days**, not calendar days. SINC-P shipped
with a calendar-day default, which understates the deadline by roughly a week once
weekends are counted, and in a compliance product understating a deadline means reporting
breaches that never happened.

`institutions.slaUseWorkingDays` now defaults to true, and the SLA engine walks working
days in Asia/Kolkata. The appeal window and the Ombudsperson period are stated without
"working" and stay on the calendar.

### Status

| Requirement | Status |
|---|---|
| Online portal for submission | Met |
| SGRC referral and report clock | Met, working-day counting on by default |
| Ombudsperson appeal tier | Met, appeal creates a linked case routed to the Ombudsperson |
| 15-day appeal window | Met, configurable per institution |
| 30-day Ombudsperson period | Met |
| Ombudsperson eligibility record | **Not met.** The role exists; the system does not record or verify the appointee's qualifying background |
| Publishing SGRC composition | Met, `/disclosures` |

---

## 2. UGC e-Samadhaan, the national portal

<https://samadhaan.ugc.ac.in/> is UGC's own centralised grievance portal, with a toll-free
line (1800-111-656) and a unique grievance ID for tracking
([about page](https://samadhaan.ugc.ac.in/Pages/AboutUs)).

**This is not a competitor. It is the escalation tier, and appearing on it is the failure
state.** A student uses e-Samadhaan when the institution has not resolved their grievance.
An institution accumulating e-Samadhaan complaints is an institution whose internal
process is not working, which is exactly the outcome an internal system exists to prevent.

The regulation requires the *institution* to run its own portal. e-Samadhaan does not
discharge that duty, and it produces no internal audit trail an institution can show a
NAAC team.

**Gap:** SINC-P has no e-Samadhaan reconciliation. An institution cannot currently match a
UGC-forwarded complaint to its own internal case. That is a real integration a design
partner would ask for.

---

## 3. NAAC, Criterion 5.1.4

The metric reads: *"The Institution has a transparent mechanism for timely redressal of
student grievances including sexual harassment and ragging cases."* Evidence expected
includes implementation of statutory guidelines, awareness and zero-tolerance
undertakings, mechanisms for online and offline submission, and timely redressal through
appropriate committees. See a worked example in
[IIS University's published 5.1.4 evidence](https://iisuniv.ac.in/NAAC/Criterion_5/5.1.4/Grievance%20Redressal%20of%20Students.pdf)
and [Ramanujan College's Criterion 5 documentation](https://ramanujancollege.ac.in/about-us/naac-ssr-report/criterion-5-student-support-and-progression/).

**The important word is "including".** 5.1.4 explicitly names sexual harassment and
ragging, which are governed by different laws with different committees and different
timelines. A system that handles only the general SGRC flow does not fully evidence 5.1.4,
which is why all three now exist as separate statutory tracks rather than as categories.

---

## 4. Sexual harassment: the PoSH Act and UGC 2015 Regulations

Every higher education institution must constitute an **Internal Complaints Committee**
under Section 4 of the Sexual Harassment of Women at Workplace (Prevention, Prohibition
and Redressal) Act, 2013, and under the
[UGC (Prevention, Prohibition and Redressal of Sexual Harassment ...) Regulations, 2015](https://www.scconline.com/blog/post/2016/06/14/ugc-prevention-prohibition-and-redressal-of-sexual-harassment-of-women-employees-and-students-in-higher-educational-institutions-regulations-2015/).

Regulation 7 requires an inquiry to be **completed within ninety days**, and a complaint
to be filed within three months of the incident
([analysis](https://blog.ipleaders.in/ugc-prevention-prohibition-and-redressal-of-sexual-harassment-of-women-employees-and-students-in-higher-education-institutions-regulation-2015-an-analysis/)).

### Status: built, with the confidentiality enforced rather than promised

A PoSH complaint is a different regime, so it is a different **track** rather than a
category with a flag. `grievances.track` is one of `sgrc`, `icc` or `anti_ragging`, and
the track decides who may see the case at all, before any per-record question is asked.

For `icc` the answer is: the Internal Complaints Committee, and nobody else.

| Role | Sees an ICC case |
|---|---|
| `icc_member` | Yes |
| `moderator` | **No.** The triage queue is the one place it must never appear |
| `institution_admin` | **No.** Being the Registrar is a system administration role, not membership of that committee |
| `redressal_officer` | **No**, even when assigned |
| `ombudsperson` | **No** |
| The student who filed it | Yes, their own |

Two places enforce this, because they fail differently:

- `canView` gates a record once you hold one.
- `accessibleTracks` builds the `WHERE` clause for every list query. A per-record check
  does not protect a list endpoint: without this, the officer queue would hand a moderator
  every ICC complaint in the institution. That is the bug this function exists to prevent
  and it has its own test.

The clock is ninety **calendar** days, from Regulation 7. The 2023 working-day rule does
not apply here because that clause does not say working.

The seed creates two ICC cases and an `icc_member`, so the claim can be tested rather than
believed: sign in as the committee member and see them, then sign in as the moderator, the
Registrar or the Ombudsperson and see nothing.

**Still not built:** the ICC's own inquiry workflow (statements, witnesses, findings) and
the three-month filing limit. What exists is confidential routing on the correct clock,
which is the part that was actively dangerous to omit.

---

## 5. Ragging: UGC Regulations, 2009

The [UGC Regulations on Curbing the Menace of Ragging in Higher Educational Institutions,
2009](https://www.antiragging.in/assets/pdf/information/ugc-iec-guidlines-for-councils-universities-and-colleges-for-curbing-the-menace-of-ragging.pdf)
are mandatory, were issued pursuant to the Supreme Court's judgment of 08.05.2009 in Civil
Appeal No. 887/2009, and require a constituted Anti-Ragging Committee and Anti-Ragging
Squad. An institution that fails to act attracts punitive action from UGC
([Pharmacy Council of India summary](https://pci.gov.in/en/blog/ugc-regulations-on-curbing-the-menace-of-ragging-in-higher-educational-institutions-2009/),
[Section 8 text](https://indiankanoon.org/doc/165185974/)).

A national reporting channel exists at <https://www.antiragging.in/>.

### Status: partial

The category exists, carries a short SLA, and bypasses triage. There is no Anti-Ragging
Committee as a distinct body, no squad workflow, and no link to the national portal.

---

## 6. Digital Personal Data Protection Act, 2023

[Act No. 22 of 2023, official text (MeitY)](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf).
The [DPDP Rules, 2025](https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025)
were notified on 14 November 2025 and set operational requirements including breach
notification, retention and cross-border processing.

An institution running SINC-P is the Data Fiduciary. SINC-P is the software it uses, and
several obligations land on how that software behaves.

| Obligation | Where SINC-P stands |
|---|---|
| Purpose limitation and notice | Partial. The filing form explains what anonymous filing does and does not hide. There is no formal privacy notice surface |
| Security safeguards | Strong. Tenant isolation verified firing, scrypt, tamper-evident trail, sniffed uploads. See [security.md](security.md) |
| Access control | Strong. Role-scoped, `canView` on every read |
| Retention limits | **Not met.** No retention policy and no expiry job for grievances or attachments |
| Erasure | Met at tenant level, verified in `docs/verification/run.sh`. No per-student erasure workflow |
| Breach notification | **Not met.** No breach detection or notification tooling |
| Cross-border processing | Controlled by deployment. The AI layer is off by default and redacts before any external call ([ADR-0002](decisions/0002-ai-and-agents.md)) |
| Children's data | **Not assessed.** Some students are minors, and DPDP treats children's data differently. This needs legal input rather than an engineering guess |

---

## Honest summary

**Built and defensible:** the UGC 2023 grievance flow end to end, the statutory clocks with
working-day counting, the Ombudsperson appeal tier, published disclosures, a tamper-evident
record, and tenant isolation that is verified rather than asserted.

**Named gaps, in order of how much they matter:**

1. **ICC / PoSH routing.** Blocks a full 5.1.4 claim, and the product must not be sold as
   the sexual harassment channel until it exists.
2. **Anti-Ragging Committee as a distinct body**, with squad workflow and a link to the
   national portal.
3. **Retention and erasure at the student level**, for DPDP.
4. **Breach notification tooling**, for DPDP.
5. **e-Samadhaan reconciliation**, so UGC-forwarded complaints match internal cases.
6. **Children's data assessment.** Needs a lawyer, not a developer.

A compliance product that overstates its compliance is the worst possible thing to sell to
a Registrar, because the first person to check is an auditor. This page exists so nobody
has to take the README's word for anything.
