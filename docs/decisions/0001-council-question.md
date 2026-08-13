# Context: modernising a 2019 college project into a 2026 product

## The original artefact (public GitHub repo, PHP/MySQL, 2019)

"SINC-P — Student Information, News & Complaints Portal". A final-year engineering
group project at an Indian NIT. Stated vision in the README, three pillars:

1. **Information** — admissions, academic calendar, fees, hostel, scholarship info
2. **News** — society recruitments, events, sports competitions, placement notices
3. **Complaints** — student grievances routed to authorities

What was ACTUALLY built: only pillar 3, and it is a lightly re-skinned copy of a
generic off-the-shelf "Complaint Management System" PHP template. Pillars 1 and 2
were never implemented. 146 PHP files, ~80 of them a literal copy-paste duplicate
of the admin folder into a "Director" folder to make a second role.

Data model (MySQL): users, admin, category, subcategory, state, tblcomplaints
(complaintNumber, userId, category, subcategory, complaintType, state, noc,
complaintDetails, complaintFile, status), complaintremark (append-only status +
remark trail), userlog (login audit incl. IP).

Workflow: student registers -> files complaint with category/subcategory/attachment
-> admin or Director sets status (Pending / In Process / Closed) with a remark
-> student sees the remark trail.

Security state: string-concatenated SQL everywhere (total SQLi), md5() passwords with
no salt, error_reporting(0), unrestricted file upload into a web-served directory,
no CSRF tokens, IDOR on complaint detail pages (?cid= is not ownership-checked),
password reset by matching email+phone with no token.

## What is being asked now (2026)

Finish the original three-pillar vision as a genuinely production-grade, go-to-market
ready product. The author is now a senior mobile engineer with 5 years of industry
experience, acting as their own product owner and CTO. The target stack is already
established in their other repos and should be reused: Next.js 16, React 19,
TypeScript, Tailwind 4, Vitest.

## The decision the council must rule on

Do NOT give me a generic "here is how to build a web app" answer. Rule on these,
concretely, with reasoning, and disagree with each other where you genuinely differ:

**Q1 — Product identity.** A college complaints box is a solved, low-value category
and campuses already have email. What is the ONE defensible product wedge that makes
this worth building in 2026 and worth an institution paying for? Options include but
are not limited to: (a) a grievance-redressal COMPLIANCE system for Indian higher-ed
(UGC mandates a Student Grievance Redressal Committee, statutory response-time
windows, an Ombudsperson, and auditable records — most colleges track this in Excel);
(b) a campus-ops workspace; (c) a student-facing super-app. Pick one and justify why
the others lose. Name the buyer and the budget line.

**Q2 — Scope discipline.** Given one engineer and a real desire to ship, what is the
minimum surface that is genuinely sellable? What in the original three pillars should
be CUT or deferred, and what single capability must be excellent? Be ruthless; the
common failure here is building all three pillars shallowly.

**Q3 — Architecture.** For a multi-tenant (multi-college) SaaS on Next.js 16 +
Postgres: rule on tenancy isolation (row-level security vs schema-per-tenant vs
database-per-tenant), on auth (roll-your-own vs a provider, given Indian colleges
often mandate data residency), on the append-only status/remark trail (is an event
log the right primitive for an auditable grievance record?), and on file attachments.
Name the specific failure mode of the option you reject.

**Q4 — The one thing most likely to kill this.** Not a generic risk list. The single
highest-probability failure mode for THIS project, and the cheapest early mitigation.

**Q5 — GTM.** Indian higher-ed procurement is slow, relationship-driven, and
price-anchored low. What is the actual first-customer motion, and what price point?
Is a free/open-source tier a trojan horse here or a mistake?

Be specific and opinionated. Short paragraphs. No preamble, no summary of my question.
