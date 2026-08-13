┌─ OPENROUTER ENSEMBLE (paid — Airgen key) ──────────────────
│ 7 labs · ~1,455 in each · up to 4,000 out each
│   qwen/qwen3-coder-30b-a3b-instruct      [bulk]  ≤ $0.001222
│   deepseek/deepseek-v4-pro               [mid]  ≤ $0.0110
│   meta-llama/llama-4-scout               [bulk]  ≤ $0.001345
│   mistralai/mistral-small-3.2-24b-instruct [bulk]  ≤ $0.001136
│   openai/gpt-5.6-luna                    [mid]  ≤ $0.002545
│   moonshotai/kimi-k2-thinking            [mid]  ≤ $0.0109
│   z-ai/glm-5.2                           [mid]  ≤ $0.0133
│ MAX COST    $0.0415  (worst case — actual is usually well under)
└────────────────────────────────────────────────────────────

══════════════════════════════════════════════════════════════════════
══ qwen/qwen3-coder-30b-a3b-instruct  [bulk]
══════════════════════════════════════════════════════════════════════

**Q1 — Product identity**

**(a) Grievance compliance system for Indian higher-ed.** This is the only defensible wedge because it addresses a hard regulatory pain point — UGC mandates require documented, timely, and traceable redressal processes that most colleges fail to meet. Unlike a generic complaints box, this is mission-critical and _legally required,_ not just convenient. By framing it as a compliance tool, you can monetize against audit readiness and institutional governance budgets. The buyer is the Principal or Director of the college, targeting the "Institutional Governance" or "Student Affairs" budget line.  

**(b) Campus-ops workspace** is too generic, with no clarity on value or retention. (c) Student super-app is more aspirational than actionable at scale — there’s no unmet need that’s worth building a new product for. A holistic student portal will always be built by institutions or through off-the-shelf tools.

---

**Q2 — Scope discipline**

**Cut:** Pillars 1 (information) and 2 (news) — they add zero value and are costly to implement in a startup-facing system.  
**Keep:** The core grievance system — with full trail, escalation, role-based access (student, HOD, Principal), compliance logging, and a way to generate PDF reports.  
**What must be excellent:** The audit trail. It has to be a true append-only log with a clear trail of who did what, when, and why. This is what makes the system trustworthy and legally defensible in a compliance context.

---

**Q3 — Architecture**

**Tenancy:** Row-level security. Database-per-tenant is overkill and adds ops complexity. Schema-per-tenant is too rigid and makes upgrades harder.  
**Auth:** Roll your own *but use a strongly audited open-source library* (e.g., Supabase Auth or Auth0 with local migrations). Indian colleges do prefer data residency, so a hosted solution with dedicated regions is acceptable (or build an auth layer that can offload to local instances).  
**Remark trail:** An event log is a better primitive than append-only comments. Each status change is a first-class event with metadata that enables tomorrow’s analytics.  
**File storage:** Use S3 or cloud storage and never serve uploads directly from the app — don’t repeat 2019’s unrestricted file upload mistake.

---

**Q4 — The one thing that kills this**

**The team will build too much and overengineer the compliance features**, assuming every edge case must be supported before launch. If we don't build a basic version first (with 3 user roles, 1 complaint category) and start testing with a beta college, we'll get stuck in “building for the future,” not “shipping now.”

---

**Q5 — GTM**

**First customer motion:** Start with a pilot at 1-2 NITs (including your own) working with a student affairs office that has complaints problems. Give them a free month for testing.  
**Pricing:** ₹25,000–50,000/year per college, via a cloud SaaS model, and add a 20–25% discount on the first 3 colleges as a launch incentive.  
**Free tier:** Mistake. It creates no conversion funnel and dilutes positioning. Build a minimum value beta — don’t offer "free" unless it's a paid product without signups. It’s more so you can get core feedback early and iterate.

══════════════════════════════════════════════════════════════════════
══ deepseek/deepseek-v4-pro  [mid]
══════════════════════════════════════════════════════════════════════

# Ruling from the Council

---

**Council Member A (The Compliance Pragmatist)**

**Q1 — Product identity.** Option (a): the UGC grievance-redressal compliance system. This is the only wedge with a non-negotiable forcing function. A college *must* have an SGRC with documented time-bound resolution, an Ombudsperson escalation path, and auditable records for NAAC/NBA accreditation visits. Excel is the incumbent, and Excel cannot prove statutory response-time SLAs to an inspection committee. Option (b) is a horizontal play that competes with the ERP incumbents (TCS iON, Fedena); you lose on integration breadth. Option (c) is a consumer play that requires network effects and student adoption; you will not unseat WhatsApp groups.

The buyer is the **Registrar’s office**. Budget line: **NAAC/NBA accreditation preparedness**, typically ₹2-5L/year for a compliance-specific tool that demonstrably reduces the risk of an accreditation deficiency notice. Name it something the UGC auditor recognises immediately.

---

**Council Member B (The Operator)**

**Q1 — Agree on buyer, challenge the wedge.** Compliance is the *budget line*, not the product. The product wedge is **closure-time as a visible metric**. Every grievance system on Earth treats complaints as a black hole from the student’s perspective. If the student-facing side publicly displays *for this category, the median resolution time is X days* (anonymised, aggregated), you have created the one thing email cannot do: institutional accountability through transparency. The Registrar doesn’t buy you for this; they buy you for the audit report. But the students use you because of it, and usage is what generates the compliance data. Without student-side pull, the complaints channel stays empty and the compliance record is a fiction.

---

**Q2 — Scope discipline.**

**Cut:** Pillar 1 (Information). This is a CMS problem solved by the college website or a static page. Rebuilding a CMS for each college is a support sinkhole.

**Defer:** Pillar 2 (News). This is a posting board with categories. It’s valuable for engagement but is a separate product surface. Ship it as a v1.5 bolt-on only after paid customers exist.

**Ship only:** Pillar 3 (Complaints/Grievances) rearchitected as the compliance engine. The single capability that must be excellent is the **auditable, timestamped, SLA-tracked resolution trail with automated escalation**. If a grievance sits in “In Process” for > 7 working days, the system must auto-flag it, notify the Ombudsperson, and log the breach immutably. That single feature is what the Excel sheet cannot do and what justifies the purchase order.

**Member A dissent:** I’d keep a *single-page* “Information” module for statutory disclosures only (fee structure, anti-ragging committee, SGRC list as UGC mandates posting). It’s a checkbox feature that helps the Registrar justify the purchase; it takes 2 days to build as a markdown-rendered page.

---

**Q3 — Architecture.**

**Tenancy isolation: row-level security with a shared database.** Defend: this is a low-cardinality multi-tenant app (200 colleges, not 20,000). Schema-per-tenant is an operational nightmare at migration time when you have 200 schemas to alter atomically. Database-per-tenant eats your connection pooler and kills your margin on a small deal size. The failure mode of schema-per-tenant is **migration skew** — one tenant on schema v12, another on v14, and suddenly your application code must be backward-compatible with 200 subtly different shapes, which one engineer cannot sustain.

**Member B pushback:** RLS in Postgres is solid, but the failure mode of RLS *in your application layer* is a missing `WHERE tenant_id = $current_tenant` in one query out of 100 that bypasses the policy because you ran it as the service role. I will accept RLS only if you enforce it at the database level with `ALTER TABLE ENABLE ROW LEVEL SECURITY` and a hard-coded `current_setting('app.tenant_id')` — never rely on application-layer filtering as your sole isolation.

**Auth: roll-your-own with Argon2id.** Indian data residency means many colleges will demand on-prem or Indian-cloud deployment (they’ll ask for a server in their basement). An external auth provider becomes a liability when the deployment is air-gapped. Build a simple email/password + TOTP system using `oslo` (the Norwegian auth library, not a provider). Reject: NextAuth/Clerk/Auth0 as the *only* path. Supporting them as an *option* is fine, but your core auth must not depend on a third-party service that might route auth requests through a US datacenter.

**Append-only trail:** Yes, an event log is the right primitive. A `grievance_events` table with `(id, grievance_id, actor_id, event_type, payload JSONB, occurred_at)` where `event_type` is `created | status_changed | remark_added | escalated | closed`. The `remark` table from the original is wrong because it conflates two concerns (status transition and human-readable remark). An event log is append-only by discipline; you never UPDATE a row, only INSERT. This gives you the immutable audit trail the compliance use-case demands. Reject: the original `complaintremark` table approach because an admin can retroactively edit a remark and claim it was always there; an event log with a hash-chained previous event ID makes tampering evident.

**File attachments: object storage with pre-signed URLs.** Never store files in the database or web-served directory. Use S3-compatible storage (MinIO for on-prem deployments), generate pre-signed URLs that expire in 10 minutes, and run ClamAV on upload before the file becomes accessible. The failure mode of the original approach (unrestricted upload to a web directory) is a student uploading a `.php` file and owning the server. That is not hypothetical; it is the #1 rootkit vector on college servers.

---

**Q4 — The one thing most likely to kill this.**

**Registrar procurement requires an on-premises deployment inside the college’s creaking Windows Server 2012 VM that runs XAMPP, and you’ve bet entirely on Next.js 16 + Postgres + object storage with Docker as your deployment model.**

The cheapest early mitigation: build a first-class Docker Compose file and a one-command installer script (`curl | bash` style, I hate it but it works for this audience) that brings up the entire stack on a bare Ubuntu 22.04 server. Provide an ISO with everything pre-baked if necessary. The moment you tell a college IT admin (who is a lecturer on rotation) to configure a Node runtime, you have lost the deal. Your entire stack must run behind their existing Apache/Nginx reverse proxy and look to them like “it’s on port 3000, proxy it.” If you cannot install this on a weekend in a NIT server room with no internet access except a USB stick, you will die at the POC stage.

**Member A addition:** The second killer is the college demanding customization of the complaint category tree per department, per hostel, per campus, and you say yes to every request during the free pilot. Ship with a fixed, UGC-mandated category set. Custom categories are a paid feature starting at a price that funds a second engineer.

---

**Q5 — GTM.**

**First-customer motion:** Do not sell to a college. Sell to the **Director/Dean of your own alma mater NIT** using the alumni network. The script is: “I built this for my final year project. I’ve since rebuilt it properly. I will deploy it for free for one academic year in exchange for a case study and a testimonial. You get NAAC-ready grievance records at zero cost, I get a reference customer.” This is not a sales call; it’s an alumni contribution that happens to be a product trial. The cost of acquisition here is a train ticket to campus.

**Price point:** ₹49,999/year for the first 5 paying colleges, with the alumni-NIT as the free lighthouse customer. This is low enough to be a discretionary purchase by a department head without a full tender process (the tender threshold in many Indian public institutions is ₹1L). The goal is not revenue in year one; it is 5 logos on a website that say “[College Name] uses GrievanceHub for SGRC compliance.”

**Free/open-source tier: Mistake.** Indian colleges do not value free software; they value *someone to blame when it breaks*. A free tier signals “this is a student project, unsupported.” They will install it, it will fail because they misconfigured Postgres, and they will tell their peer institutions “that thing doesn’t work.” Charge from day one, even if it’s a token amount. The price is part of the credibility signal.

**Member B dissent on open-source:** Open-source the core engine under AGPL, offer a hosted SaaS with support. The AGPL is your trojan horse: the college IT admin inspects the code, feels comfortable hosting it themselves, fails at maintenance within 6 months, and then converts to your hosted version. But this only works if you have the capacity to say “self-hosted issues are community support only; SLA is for paying customers.” Given one engineer, I concede this is too complex for year one. Stick with Member A’s alumni play.

══════════════════════════════════════════════════════════════════════
══ meta-llama/llama-4-scout  [bulk]
══════════════════════════════════════════════════════════════════════

## Q1 — Product Identity

I propose option (a) a grievance-redressal COMPLIANCE system for Indian higher-ed. The University Grants Commission (UGC) mandates a Student Grievance Redressal Committee, which includes statutory response-time windows, an Ombudsperson, and auditable records. Most colleges currently track this in Excel, making it a prime candidate for digitization. This focus provides a clear defensible wedge, as institutions must comply with these regulations.

Buyer: The Principal or Registrar of the college, budget line: Education Technology or Institutional Development.

Disagreeing council member: I think option (b) a campus-ops workspace has more potential. It can integrate various college operations, making it a more comprehensive solution. However, I acknowledge that compliance with UGC mandates provides a strong initial hook.

## Q2 — Scope Discipline

Given one engineer, I recommend focusing on the grievance-redressal COMPLIANCE system (pillar 3) with excellent execution. Cut or defer pillars 1 (Information) and 2 (News) for now. The minimum sellable surface includes:

* Student registration and complaint filing
* Admin/Director role with status updates and remark trail
* Basic reporting and audit log

Defer features like advanced analytics, customizable workflows, or integration with existing college systems.

Disagreeing council member: I think a minimal viable product (MVP) should include basic information and news features to demonstrate the platform's potential. However, I agree that pillar 3 should be the primary focus.

## Q3 — Architecture

For tenancy isolation, I recommend schema-per-tenant. This approach provides a good balance between isolation and manageability. Row-level security can be complex to implement and manage, while database-per-tenant may lead to scalability issues.

For auth, I suggest using a provider like Okta or Auth0, which supports data residency and can integrate with Indian college systems. Roll-your-own auth may lead to security vulnerabilities.

For the append-only status/remark trail, an event log is a suitable primitive. It provides an auditable record of all changes and can be easily implemented using a database.

For file attachments, use a cloud storage service like AWS S3 or Google Cloud Storage, with proper access controls and validation.

Rejected option: Database-per-tenant, as it may lead to scalability issues and increased costs.

## Q4 — The One Thing Most Likely to Kill This

The single highest-probability failure mode for this project is inadequate buy-in from college administrators due to poor change management and insufficient training. Many colleges in India may resist adopting a new digital system, especially if it requires significant changes to their existing processes.

Cheapest early mitigation: Develop a comprehensive change management plan, including training and support for college administrators, and pilot the system with a small group of colleges to gather feedback and build momentum.

## Q5 — GTM

The actual first-customer motion should focus on a small pilot with a college that has a strong champion for digital transformation. Offer a customized implementation and training program to ensure successful onboarding.

Price point: ₹50,000 - ₹100,000 (approximately $650-$1,300 USD) per year, depending on the number of students and features required.

A free/open-source tier can be a useful marketing tool, but it should not be a trojan horse. Instead, offer a limited-feature version with support for a small number of users, and charge for additional features, support, and scalability. This approach allows colleges to try the system before committing to a paid plan.

Disagreeing council member: I think a freemium model with a more generous free tier (e.g., 100 users) could be effective in gaining traction and generating word-of-mouth. However, I agree that a paid plan with additional features and support is necessary for long-term sustainability.

══════════════════════════════════════════════════════════════════════
══ mistralai/mistral-small-3.2-24b-instruct  [bulk]
══════════════════════════════════════════════════════════════════════

### **Q1 — Product Identity**
**Option (a): Grievance-redressal compliance system for Indian higher-ed (UGC mandate).**
- **Why?** Colleges *must* comply with UGC’s grievance-redressal rules (response times, audit trails, Ombudsperson logs). Most track this in Excel or Word—this is a painful, high-stakes process ripe for digital disruption.
- **Buyer:** College registrars, admin heads, or UGC compliance officers. Budget line: "Compliance & Governance" (not IT).
- **Why not (b) or (c)?**
  - (b) Campus-ops workspace: Too broad, competes with ERP giants (like Fedena, Campus365). No wedge.
  - (c) Student super-app: Requires deep integrations (LMS, payment, etc.), high maintenance, and colleges already have fragmented solutions.

**Dissent:** If you build (a), you’re selling to bureaucrats, not students. Their pain is compliance, not usability. (b) is a better wedge if you pivot to "campus ops" later.

---

### **Q2 — Scope Discipline**
**Cut:** Pillar 1 (Information) and Pillar 2 (News). These are solved by email, WhatsApp, or college websites. **Defer:** Multi-tenant SaaS (start with a single college, then expand).
**Must-be-excellent:** **Audit-ready grievance workflow** (UGC-compliant timelines, immutable logs, escalation rules).
- **Minimum sellable surface:** A single-tenant, UGC-compliant grievance portal with:
  - Role-based access (Student, Admin, Ombudsperson).
  - SLA tracking (auto-escalation if unresolved in 7/15/30 days).
  - Exportable audit logs (PDF/CSV for UGC inspections).

**Dissent:** If you don’t nail the audit trail, you’re just another complaint box. News/Info can be a v2 feature.

---

### **Q3 — Architecture**
- **Tenancy:** **Row-level security (RLS) in Postgres.** Cheaper than schema/db-per-tenant, and colleges care more about compliance than isolation.
  - **Rejected option:** Schema-per-tenant. Failure mode: Postgres connection overhead at scale.
- **Auth:** **Roll-your-own with Indian data residency.** Colleges won’t use Auth0/Okta due to local laws. Use NextAuth.js with JWT and store data in India (AWS Mumbai, GCP Delhi).
  - **Rejected option:** Third-party auth. Failure mode: Colleges block non-local providers.
- **Append-only trail:** **Event log + PostgreSQL JSONB.** Store each status change as an immutable event. Reject: Raw append-only tables are hard to query.
  - **Rejected option:** Plain append-only table. Failure mode: No way to reconstruct state.
- **File attachments:** **S3-compatible storage (Wasabi, Backblaze) with signed URLs.** Reject: Local storage (security risk) or database blobs (scaling nightmare).

**Dissent:** If you go schema-per-tenant, you’ll regret it when you hit 100 colleges.

---

### **Q4 — The One Thing Most Likely to Kill This**
**Failure mode:** **Colleges won’t pay for a "compliance tool."** They’ll say, "We already use Excel."
- **Mitigation:** **Land with a free tier (single admin, 50 complaints/month), then expand.** Prove it’s better than Excel before asking for money.

**Dissent:** Free tier is a mistake. Colleges will never upgrade. Charge $50/month upfront.

---

### **Q5 — GTM**
**First customer motion:** **Target Tier-2/3 NITs/NITTs (less tech-savvy, more compliance pain).** Approach registrars directly, not IT departments.
- **Price point:** **$100–$300/month** (position as "UGC compliance software," not "student portal").
- **Free tier:** **Trojan horse.** Let them use it for 3 months, then charge for audit exports.

**Dissent:** Free tier is a trap. Colleges will never pay. Sell to Tier-1 colleges first—they have budgets.

══════════════════════════════════════════════════════════════════════
══ openai/gpt-5.6-luna  [mid]
══════════════════════════════════════════════════════════════════════

## Q1 — Product identity

**CTO 1: Pick compliance.** The product should be a **Student Grievance Redressal compliance system for Indian higher-ed**, not a complaints inbox.

The buyer is the **Registrar, Dean of Student Welfare, or institution secretary**, with the Grievance Redressal Committee and IT department as influencers. The budget line is **student affairs/administration, statutory compliance, ERP digitisation, or accreditation-readiness**, not “student engagement.”

The paid outcome is specific: every grievance has an owner, applicable deadline, escalation path, committee action, student communication, and exportable evidence for internal reviews, UGC-related scrutiny, accreditation, legal disputes, and leadership reporting.

Do not hard-code legal assumptions. Make response windows, committee roles, escalation rules, retention, and appeal paths configurable against the applicable UGC and institutional policy.

**Product Lead: Campus operations is the better long-term market.** Compliance alone may be too narrow and episodic. A broader case-management platform could later cover hostel, transport, academics, harassment reporting, and facilities.

**Ruling:** Start with compliance, but design the domain as a **case-management engine**. “Campus operations” is a later expansion, not the launch identity. A broad campus-ops pitch will put you against ERP vendors and create an unbounded requirements list.

**Super-app loses immediately.** Students already use WhatsApp, email, ERP portals, and payment apps. You would need enormous distribution to create a habit, while the institution—not the student—has the budget. Information and news are commodity CMS features and do not create a defensible reason to buy.

---

## Q2 — Scope discipline

The sellable v1 is:

- Student grievance intake, including confidential categories
- Case classification and triage
- Assignment to an authorised committee or officer
- Configurable statutory and institutional deadlines
- Escalations and reminders
- Student updates and acknowledgement receipts
- Committee decisions, remarks, evidence, and appeals
- Immutable activity history
- Role-based access for student, officer, committee member, Registrar, and auditor
- Dashboard for overdue, pending, resolved, and escalated cases
- One-click audit/export pack

The single capability that must be excellent is:

> **Proving that every grievance was handled by the right person, within the applicable process and deadline, with a complete, tamper-evident record.**

That means deadline calculation, escalation, permissions, notification delivery, and audit exports matter more than visual polish.

Cut the original “Information” pillar entirely from v1. Link to the college’s existing website instead. Cut general news, events, society recruitment, fees, hostel information, scholarships, and generic announcements. They are CMS features with weak willingness to pay.

Do not build a native mobile app initially. Build an accessible responsive web experience and an officer console. Add email first; add SMS or WhatsApp only when a pilot demonstrates that email delivery is insufficient.

A useful v1 can be built with one engineer only if the product supports **one grievance policy per institution plus configurable categories and roles**, rather than a general workflow builder.

---

## Q3 — Architecture

### Tenancy

**Ruling: shared Postgres database with tenant-scoped rows and PostgreSQL RLS.**

Every tenant-owned table gets a non-null `tenant_id`. The application connects using a restricted database role that cannot bypass RLS. Policies use a transaction-local tenant context, and sensitive tables use `FORCE ROW LEVEL SECURITY`.

The dangerous failure mode is not RLS itself; it is accidentally running queries as a superuser or pooled connection with a stale tenant context. That can expose one college’s grievances to another. Mitigations:

- Never use the migration or database owner role at runtime
- Set tenant context at the start of every transaction
- Clear it on transaction completion
- Test cross-tenant reads and writes in integration tests
- Add repository-level tenant scoping as a second defence
- Log tenant, actor, and request IDs for every privileged operation

Schema-per-tenant creates migration and operational complexity for one engineer. Database-per-tenant provides stronger isolation but creates provisioning, backups, upgrades, reporting, and support costs that are unjustified at launch. Offer dedicated databases later for very large or unusually sensitive institutions.

### Authentication

**Do not roll your own password, reset, session, or MFA system.**

Use OIDC/SAML-compatible authentication and keep institution membership, roles, and authorisation in your own database. For Indian institutions, either:

1. Use a provider with contractually guaranteed Indian data residency and suitable enterprise controls; or
2. Self-host an OIDC provider such as Keycloak or Zitadel in an India-region cloud environment.

The product should support institution SSO where available and passwordless email login or managed credentials for smaller colleges. Residency is not solved merely by storing application data in India: authentication logs, backups, email providers, analytics, and support tooling also need review.

The rejected option—roll-your-own auth—fails through predictable password-reset, session, MFA, account-enumeration, and privilege-escalation bugs. The 2019 MD5 and email-plus-phone reset model must not be migrated.

### Grievance history

An append-only `complaintremark` table is better than overwriting a status, but it is not enough for a defensible record.

Use an append-only domain event or case-event table containing:

- Case and tenant ID
- Event type and structured payload
- Actor, role, and authorisation basis
- Server timestamp
- Previous status and new status
- Applicable deadline and reason for changes
- Correlation/request ID
- Attachment references
- Notification and delivery results

Current case state can be a projection for fast reads. Corrections happen through new events, never by editing history. For higher-assurance customers, add hash chaining or periodic signed audit manifests and retention controls. Do not claim that a hash chain alone makes the record legally immutable; database, administrator, backup, and operational controls still matter.

### Attachments

Never store uploads in a web-served directory.

Use private object storage in the selected residency region. Store only metadata and object keys in Postgres. Upload through short-lived signed URLs or a controlled upload endpoint, then:

- Enforce size, count, extension, and MIME limits
- Inspect file signatures rather than trusting the filename
- Malware-scan before making files available
- Generate safe download names
- Block executable and active-content formats
- Serve only through short-lived authorised URLs
- Apply tenant and case-level authorisation on every download
- Record upload, scan, view, and deletion events
- Define retention and legal-hold behaviour

The rejected shortcut—public object URLs or web-root uploads—turns a student attachment into a malware delivery mechanism and often permits IDOR-based disclosure of other students’ evidence.

---

## Q4 — The most likely killer

**The highest-probability failure is building a polished compliance product without a college willing to adopt it.**

The problem is not technical feasibility. It is that the Registrar, committee, IT department, and existing informal process may not agree on ownership, confidentiality, escalation, or whether the product exposes institutional risk. A college can continue using email and Excel without feeling an immediate enough pain to change.

The cheapest mitigation is a **paid design-partner pilot before substantial implementation**:

- Interview the Registrar and actual committee members
- Obtain their current Excel, email templates, policy, deadlines, and reports
- Shadow five to ten real cases, with sensitive data redacted
- Produce an audit-pack prototype in two weeks
- Secure a signed pilot statement or paid deployment
- Make the first customer approve the workflow and success criteria

If nobody will provide a real workflow, data sample, decision-maker, and money—even a small pilot fee—stop or reposition. That is stronger evidence than another month of coding.

---

## Q5 — GTM and price

**CTO 1: Start with private or deemed institutions, not government universities.** Use the founder’s alumni, engineering, and industry network to reach a Registrar, Dean Student Welfare, or institutional secretary. Sell a narrowly defined outcome:

> “Replace grievance Excel and email with a deadline-controlled, audit-ready case register in six weeks.”

The first deployment should include data import, role setup, policy configuration, committee training, and a monthly compliance report. Do not sell “software access” alone; sell implementation plus operational change.

A credible initial price is:

- **₹75,000–₹1.5 lakh** for a narrowly scoped paid pilot or setup
- **₹2–₹5 lakh per year** for a small or mid-sized institution
- Higher pricing for SSO, multiple campuses, advanced retention, dedicated hosting, or contractual SLAs

Price by institution or campus, not by complaint. Charging per grievance creates the wrong incentive and makes budgeting difficult.

The first customer motion should be:

1. Warm introduction to a decision-maker
2. Workflow and policy discovery
3. Free or low-cost audit-readiness assessment
4. Paid six-week pilot
5. Annual contract after one reporting cycle or committee review
6. Referenceable case study and referral to affiliated colleges

**Product Lead: Open source can create trust.** Colleges may be suspicious of a small vendor holding sensitive complaints. An open-source core could reduce perceived lock-in.

**Ruling:** A free hosted tier is a mistake. It attracts students, hobby deployments, and institutions with no procurement intent while creating support and security obligations. It also undermines the claim that this is a serious compliance system.

You may open-source a small SDK, export format, policy schema, or self-hosted community edition later. Keep the hosted product, security updates, residency controls, implementation, audit exports, and support paid. The trojan horse is not free software; it is a successful, narrowly scoped paid pilot that gives one institution evidence it can show its governing body.

══════════════════════════════════════════════════════════════════════
══ moonshotai/kimi-k2-thinking  [mid]
══════════════════════════════════════════════════════════════════════

**Q1 — Product identity**

**Arjun:** The wedge is **(a) statutory compliance**. Buyer: the **IQAC (Internal Quality Assurance Cell) Coordinator** reporting to the Principal. Budget line: **NAAC accreditation preparation** (a non-fungible grant that must be spent on “student support systems” ahead of the next SSR cycle). News and campus-ops are graveyards because they compete with free WhatsApp groups and Microsoft Teams; only the fear of an NAAC demotion or UGC punitive action opens the chequebook.

**Priya:** You are building **(b) a campus-ops workspace**, but sell it as “Student Lifecycle Orchestration.” Buyer: the **Registrar or Dean of Student Affairs**. Budget line: **Student Amenities Fund** (recurring OPEX, not tied to accreditation cycles). Compliance is table stakes; the lock-in comes from becoming the operating system for hostel wardens, transport desks, and exam controllers who currently use WhatsApp and Excel. A pure complaints tool is a cost-center; workflow automation is a efficiency sell.

**Vikram:** Arjun is right about the buyer—**IQAC** pays—but Priya is right about adoption. The defensible wedge is **(a) with a Trojan horse of (c)**. Position as the “Official Grievance Redressal Platform” (mandated), but require students to install the app for push notifications, then cross-sell news/events to drive DAU. Reject (b) outright: campus ops is a feature of ERPs like TCS iON or Academia; you cannot out-integrate them.

---

**Q2 — Scope discipline**

**Arjun:** Cut pillars 1 and 2 entirely. The minimum sellable surface is **Excel import/export + statutory report generation** (response-time SLA violations, pending case aging). One capability must be excellent: **escalation workflows** (auto-escalate to Ombudsperson if status != Resolved in 30 days). That is the demo hook; everything else is scope creep.

**Priya:** Cut the “Director” role and the “News” CMS. Ship **only Hostel Maintenance** end-to-end (file → contractor dispatch → feedback). It is narrow enough to demo in 10 minutes and deep enough that Wardens will riot if you take it away. Defer multi-category complaints; generalizing too early creates shallow UX.

**Vikram:** Cut multi-tenancy. Ship **single-tenant, white-label instances** (one Postgres DB per college, deployed via Docker Compose on their infra or yours). The “SaaS” multi-tenant architecture is premature optimization for a one-engineer army; you will spend six months on tenant isolation instead of features the Registrar can see.

---

**Q3 — Architecture**

**Arjun:** **Schema-per-tenant** in Postgres. Use isolated schemas with `search_path` switching. Reject **RLS**: the failure mode is *query plan leakage*—a toxic tenant with 10M rows generates a sequential scan that poisons the shared buffer cache, degrading performance for everyone with no visibility in your APM. Reject **DB-per-tenant**: connection pool exhaustion when you hit 200+ colleges.

**Priya:** **RLS with Postgres policies** and a `tenant_id` column in every table. Reject **Schema-per-tenant**: the failure mode is *migration drift hell*. When you deploy a schema change, you must run it against N schemas atomically; if one fails, you have inconsistent DDL across your fleet and no atomic rollback. For auth, use **NextAuth.js with a custom Credentials provider** backed by your Postgres (data residency satisfied); reject Auth0/Supabase Auth (US/EU clouds, legal risk).

**Vikram:** **Database-per-tenant** via PgBouncer connection pooling and automated provisioning (Terraform + Neon or similar). Reject **RLS**: the failure mode is *privilege escalation bugs*—a missed predicate in a policy exposes cross-tenant data silently. For the **append-only trail**, treat the `complaintremark` table as an event log (insert-only, no UPDATES/DELETES, with a `sequence_number` and `previous_hash` for tamper evidence); do not use a generic “events” table—forensic auditors expect domain-specific tables. For **file attachments**, store in S3 with **pre-signed URLs** and scan with ClamAV before the final upload; the 2019 “unrestricted file upload” vulnerability repeats if you trust MIME types.

---

**Q4 — The one thing most likely to kill this**

**Arjun:** **Procurement cycle death**. Indian higher-ed procurement averages 9–18 months; you will run out of runway before the PO is signed. Cheapest mitigation: **Sell to private autonomous universities** (Amity, VIT, Manipal) where the Trustee signs the cheque in 48 hours, not government NITs with CPWD tenders.

**Priya:** **The empty-room problem**. Students will not download a “complaint box” app. If DAU is zero, the college sees no value and churns. Cheapest mitigation: **WhatsApp Business API integration** on day one. Let students file complaints via WhatsApp; the app is just the dashboard for admins. Meet them where they are.

**Vikram:** **Regulatory liability under India’s DPDP Act 2023**. The 2019 codebase’s `md5` passwords and IDOR vulnerabilities are now criminal data-practice violations (financial penalties up to ₹250 Cr). Cheapest mitigation: **Do not port any old code**. Start with **column-level encryption** for PII (email, phone, complaint details) using pgcrypto from day one; retrofitting encryption later requires table rewrites that freeze the DB for hours.

---

**Q5 — GTM**

**Arjun:** No free tier. First motion: **Direct outbound to IQAC heads** on LinkedIn with a “NAAC readiness checklist” lead magnet. Price: **₹3 Lakh/year** ($3.6k USD) flat for private colleges; ₹8 Lakh for deemed universities. Open-source is a mistake; Indian colleges demand unlimited support but refuse to pay for “free” software.

**Priya:** **Freemium for students, seat-based for admins**. First motion: **Land with the Cultural Fest committee**—they need a ticketing/registration system (pillar 2 resurrected temporarily). Once the app is on 5,000 student phones, pitch the Complaints module to the Registrar. Price: ₹50k pilot, scaling to ₹2 Lakh/year. Free tier builds the viral loop.

**Vikram:** **Open-core, not open-source**. Release the **grievance workflow engine** (the state machine) under Apache 2 to build trust with CIOs, but sell the hosted multi-tenant SaaS with analytics and backups. First motion: **ERP implementation partners** (TCS iON, Academia resellers) who need a grievance module but won’t build it. Price: **$100 per admin seat/month**; they have the relationships, you have the software.

══════════════════════════════════════════════════════════════════════
══ z-ai/glm-5.2  [mid]
══════════════════════════════════════════════════════════════════════

**Q1 — Product Identity**

**Product Lead:** Option (a). The UGC Student Grievance Redressal mandate is the only wedge with a regulatory gun to the buyer's head. If a college misses a statutory response window, they face penalties or accreditation issues. The buyer is the Registrar or Dean of Student Affairs. The budget line is "Compliance and Administrative Software," not "student activities." 

**CTO A:** Super-app (c) loses because it requires massive student adoption to matter, and you'll get outpaced by WhatsApp groups. Campus-ops (b) is too sprawling for one engineer to build deep enough to displace existing fragmented tools. Compliance (a) is the only one where the buyer pays out of fear and necessity, not convenience. 

**Q2 — Scope Discipline**

**CTO B:** Cut Pillars 1 (Information) and 2 (News) completely. They are total noise. The minimum sellable surface is a strictly scoped Pillar 3: a Grievance Redressal workflow. The single capability that must be excellent is the **SLA tracking and automated escalation engine**. If a complaint hits 25 days without resolution, it must auto-escalate to the Ombudsperson. That is what UGC audits care about. The UI can look like a 2010 spreadsheet as long as the audit log and SLA timers are flawless.

**Product Lead:** Agreed. You aren't building a community; you are building a paper trail. The only feature that matters is proving to an auditor that the institution responded within the statutory 30-day window.

**Q3 — Architecture**

**CTO A:** 
*   **Tenancy:** Row-Level Security (RLS) in Postgres using a `tenant_id` (college_id). *Rejected option:* Schema-per-tenant. *Failure mode:* You will inevitably fail to execute a migration on one tenant's schema, causing split-brain application logic and silent data corruption.
*   **Auth:** Use a self-hostable provider like SuperTokens or Authentik. Do not roll your own. Indian data residency is real, but deploying the provider on AWS/Azure Mumbai solves this. *Rejected option:* DIY Auth. *Failure mode:* You will mess up token invalidation or password resets, which instantly destroys trust in a compliance tool.
*   **Remark Trail:** Yes, an append-only event log is mandatory. You are building an immutable ledger of actions (`complaint_id`, `actor_id`, `timestamp`, `action`, `old_state`, `new_state`). Do not use simple row updates on a `complaints` table; you will lose audit history.
*   **Attachments:** S3-compatible storage (e.g., MinIO self-hosted or S3 Mumbai) with pre-signed URLs. *Rejected option:* Next.js API route proxying file uploads. *Failure mode:* A student uploading a 50MB video of a hostel fight will exhaust your Node.js memory and crash the Next.js server, taking down the whole app.

**CTO B:** I agree on RLS, but I'd push back slightly on SuperTokens. For a single-engineer team, Clerk or Auth0 with their dedicated APAC data centers might be worth the SaaS tax to avoid managing auth infra. But yes, absolutely no DIY auth.

**Q4 — The one thing most likely to kill this**

**CTO B:** The admin (Registrar) hates it. If your software makes filing complaints easier for students but creates more manual data-entry or notification noise for the Registrar, the Registrar will sabotage adoption. They will tell students to "just email me," and when the UGC audit comes, they will blame your software for missing records. 
*Cheapest early mitigation:* Build the Registrar’s dashboard first. Do not write a single line of React for the student portal until the admin workflow takes fewer clicks than resolving an email. 

**Product Lead:** I'll disagree. The biggest killer is procurement paralysis. Indian higher-ed takes 6-12 months to issue a PO. You will run out of runway before the check clears. *Cheapest early mitigation:* Target private, tier-2/3 colleges. They have smaller discretionary budgets but can bypass the massive state/central procurement red tape. 

**Q5 — GTM**

**Product Lead:** I concede the procurement point. Target private Tier-2/3 engineering colleges. They are terrified of AICTE/UGC audits but lack the staff to manage it manually. First-customer motion: Cold email Deans of Student Affairs with a link to the UGC mandate and a subject line: "Are you audit-ready for the 2026 Grievance Redressal cycle?" Offer a ₹40,000/year ($500) price point. It is cheaper than hiring a part-time clerk to manage the Excel sheets.

**CTO A:** Open source is a massive mistake here. OSS works for developer tools where the user is the buyer. In ed-tech compliance, the buyer is a bureaucrat. If you open-source it, colleges will self-host it on a broken Raspberry Pi in the library basement, fail to update it, get breached, and blame you. Keep it closed. Sell the SaaS and the SLA guarantee. 

**CTO B:** Actually, open-source *could* be a trojan horse, but not for colleges—for the government. If you can get a state education department to mandate your open-source standard, you win the integration market. But that's a 5-year play. For 2026, CTO A is right. Close-source it, sell the SaaS, and focus on private colleges with cash and fear.

⚠  openai/gpt-5.6-luna cost $0.003678 against an estimate of $0.002545 (1.4x).
   Hidden system prompt or uncapped reasoning tokens. Re-quote before using it at volume.

── ensemble spent $0.0318 across 7/7 models
   Judge the spread on Claude — it is free, and it is the only thing here that can see your context.
