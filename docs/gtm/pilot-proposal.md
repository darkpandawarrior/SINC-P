# SINC-P Pilot Engagement Proposal

**Prepared for:** [INSTITUTION NAME, e.g. Example Institute of Technology]
**Prepared by:** SINC-P
**Date:** [DATE]
**Proposed pilot start date:** [START DATE]
**Proposed pilot end date:** [START DATE + 6 weeks]

*This is a template. Bracketed fields are placeholders to be filled in per institution.
All names below (Example Institute of Technology, Registrar A. Sharma) are fictional and
used only to show the document's shape.*

---

## 1. Purpose

This proposal sets out the terms of a six-week paid pilot deployment of SINC-P, a
statutory grievance-redressal compliance system, at [INSTITUTION NAME]. The pilot exists
to demonstrate, on [INSTITUTION NAME]'s own grievance data and process, that SINC-P closes
the specific gap between the Student Grievance Redressal Committee's (SGRC) obligations
under the UGC Grievance Redressal Regulations and what [INSTITUTION NAME] can currently
prove to a NAAC or NBA inspection committee.

## 2. Scope

**In scope for this pilot:**
- Deployment of the full SINC-P product: the grievance-handling engine, the statutory
  disclosure page (SGRC composition, Ombudsperson contact, anti-ragging committee, fee
  structure), and the announcements surface.
- Deployment target: [self-hosted on institution infrastructure, behind existing nginx, no
  internet dependency / hosted by SINC-P], to be confirmed by [INSTITUTION NAME] before
  start.
- Migration of existing grievance records from [INSTITUTION NAME]'s current
  spreadsheet/register, on a best-effort basis. Historical records with missing dates or
  ambiguous status will be flagged rather than silently guessed.
- Accounts and role-based access for SGRC members and department-level grievance officers,
  count to be agreed before start (typical range: 5-15 accounts for a college this size).
- One training session for SGRC members and department officers, plus a dedicated
  walkthrough with the IQAC Coordinator on producing an accreditation-ready export.
- An end-of-pilot compliance-readiness report identifying gaps in the current process
  that the system closes, written for the Registrar to present internally or to an
  accreditation body.

**Out of scope for this pilot** (available in the year-1 subscription, see
`pricing.md`, or as a separately scoped item):
- Institutional SSO/SAML integration.
- Custom branding beyond institution name and logo on the disclosure page.
- Integration with any existing ERP or student information system.
- Ongoing support past the six-week window (year-1 subscription includes one-business-day
  support response).

## 3. Timeline (six weeks)

| Week | Activity |
|---|---|
| 1 | Kickoff call. Confirm deployment target, gather existing grievance data for migration, confirm SGRC member and officer list for account creation. |
| 2 | Deployment to [INSTITUTION NAME]'s environment. Data migration. Internal testing by SINC-P. |
| 3 | Training session for SGRC members and department officers. IQAC Coordinator walkthrough. |
| 4 | Live use begins. New grievances filed and handled through the system. Daily availability from SINC-P for issues. |
| 5 | Continued live use. Mid-pilot check-in call to surface any workflow friction and adjust. |
| 6 | Pilot close. Compliance-readiness report delivered. Go/no-go conversation on year-1 subscription. |

## 4. Success criteria

The pilot is judged a success if, by the end of week 6:
- At least [N, typically 5-10 for a six-week window] real grievances have been filed and
  taken to resolution through the system by actual SGRC members and officers, not test
  data.
- The IQAC Coordinator can independently produce a grievance-status export without
  assistance from SINC-P.
- The compliance-readiness report identifies at least one concrete gap in the prior
  process (a missed SLA, an untracked complaint, an inconsistent record) that the system
  now closes. This is the evidence the Registrar takes into the year-1 decision.
- No data loss or unauthorised access incident occurs during the pilot window.

These criteria are agreed in advance so the go/no-go conversation in week 6 is a
comparison against a stated bar, not a subjective impression.

## 5. Cost and payment

Pilot fee: **₹75,000**, one-time, covering the full six-week scope above. Payable [50% on
signing, 50% on pilot completion / per INSTITUTION NAME's standard vendor payment terms,
to be confirmed]. This fee is separate from, and not automatically credited against, the
year-1 subscription fee should [INSTITUTION NAME] choose to continue. See `pricing.md`
for year-1 terms.

## 6. Data protection commitments (DPDP Act 2023)

[INSTITUTION NAME] is the Data Fiduciary for student and staff personal data processed
through SINC-P; SINC-P acts as a Data Processor under the Digital Personal Data
Protection Act, 2023, and commits to the following for the duration of the pilot and any
subsequent subscription:

- **Purpose limitation.** Personal data collected through grievance filings (student
  name, contact details, complaint content, attachments) is used only to operate the
  grievance-handling workflow for [INSTITUTION NAME]. It is never used for any other
  purpose, including by SINC-P, without [INSTITUTION NAME]'s explicit written consent.
- **No cross-tenant access.** [INSTITUTION NAME]'s data is logically isolated from every
  other institution using SINC-P, enforced at the database level, not only at the
  application level.
- **Storage location.** [Data resides on infrastructure located in India / on
  [INSTITUTION NAME]'s own premises, per the deployment target chosen in Section 2], to
  be confirmed at kickoff.
- **Retention.** Grievance records are retained for the duration of the engagement plus
  [institution's own retention policy period, typically aligned to NAAC/NBA record-keeping
  requirements, to be confirmed], after which they are deleted or exported and purged
  per [INSTITUTION NAME]'s instruction.
- **Breach notification.** SINC-P will notify [INSTITUTION NAME]'s designated contact
  within 72 hours of confirming any unauthorised access to or disclosure of personal data
  processed under this engagement.
- **Access and correction.** [INSTITUTION NAME] retains the right, on behalf of data
  principals (students, staff), to request access to, correction of, or erasure of
  personal data held in the system, consistent with DPDP Act obligations.

## 7. Exit and data portability

At the end of the pilot, whether or not [INSTITUTION NAME] proceeds to a year-1
subscription, SINC-P commits to:
- Providing a complete export of all [INSTITUTION NAME]'s data, grievance records,
  event history, attachments, and account information, in a non-proprietary format
  (CSV for structured records, original file format for attachments) within 10 business
  days of a written request.
- Deleting all of [INSTITUTION NAME]'s data from SINC-P-hosted infrastructure within 30
  days of confirmed export and a written deletion request, except where retention is
  required by law.
- No lock-in clause, no penalty for choosing not to continue past the pilot. The pilot
  fee covers the six-week engagement regardless of the year-1 decision.

## 8. Signatures

This proposal, once signed by both parties, constitutes agreement to the scope, timeline,
and terms above.

**For [INSTITUTION NAME]:**

Name: _________________________ (e.g. A. Sharma, Registrar)
Designation: _________________________
Signature: _________________________
Date: _________________________

**For SINC-P:**

Name: _________________________
Signature: _________________________
Date: _________________________
