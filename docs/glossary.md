# Glossary

Indian higher education runs on acronyms, and this codebase is full of them. If you are
reading the code without that background, most of the domain decisions look arbitrary
until you know what these mean.

Ordered by how often they appear in the code rather than alphabetically, because the first
six explain most of it.

---

### SGRC: Students' Grievance Redressal Committee

The committee an institution must constitute under the UGC (Redressal of Grievances of
Students) Regulations, 2023. It receives grievances, considers them, and reports with
recommendations to the institution's competent authority, copying the student.

In the code this is the default `track` on a grievance and the ordinary path through the
officer console.

### Ombudsperson

The appeal tier above the SGRC, appointed by the university. A student unhappy with an
SGRC decision may appeal within 15 days, and the Ombudsperson has 30 days to resolve it.

Must be a retired vice-chancellor, a retired professor with ten years of experience, or a
former district judge. The system records the role but does not verify that background,
which is listed as an open gap in [compliance.md](compliance.md).

### ICC: Internal Complaints Committee

The committee that handles sexual harassment complaints, required by Section 4 of the
PoSH Act 2013 and the UGC 2015 Regulations. Ninety-day statutory inquiry.

**This is a separate track rather than a category**, because the confidentiality rules
differ: an ICC complaint is visible only to the committee,
not to the moderator who triages everything else and not to the Registrar. See
[ADR-0002](decisions/0002-ai-and-agents.md) for the reasoning and
`src/lib/grievance/policy.ts` for the enforcement.

### PoSH: Prevention of Sexual Harassment

Shorthand for the Sexual Harassment of Women at Workplace (Prevention, Prohibition and
Redressal) Act, 2013. In higher education it is layered with the UGC 2015 Regulations.

### UGC: University Grants Commission

The statutory body that regulates higher education standards in India and issues the
regulations this product is built to. Also runs
[e-Samadhaan](https://samadhaan.ugc.ac.in/), the national grievance portal that sits above
every institution's own.

### NAAC: National Assessment and Accreditation Council

Accredits institutions and grades them. **Criterion 5.1.4** is the metric about grievance
redressal, and it is the reason a Registrar has a budget line for this at all. The
accreditation cycle expiring is the forcing function the whole go-to-market plan hangs on.

---

### NBA: National Board of Accreditation

Accredits individual programmes rather than whole institutions, mostly technical ones.
Engineering colleges often hold NBA at programme level and NAAC at institution level, so
both cycles matter when scoring a prospect.

### IQAC: Internal Quality Assurance Cell

The unit inside an institution responsible for accreditation readiness. Usually the
champion for this product rather than the buyer: they feel the audit-week scramble
directly and are easier to reach than the Registrar.

### AISHE: All India Survey on Higher Education

The national survey. Every recognised institution has an **AISHE code**, which is why
`institutions.aisheCode` exists: it is the natural external key, and it makes a tenant
list verifiable against a real registry rather than against a spreadsheet.

### SSR: Self Study Report

The document an institution submits to NAAC ahead of a visit. The compliance dashboard is
built to be screenshotted into one, which is why it has a print stylesheet.

### DPDP: Digital Personal Data Protection Act, 2023

India's data protection law. An institution running SINC-P is the **Data Fiduciary**; the
software is the tool it uses. Obligations that land on the software are in
[compliance.md](compliance.md).

### e-Samadhaan

UGC's national grievance portal. The escalation tier above every institution's own portal. A
complaint reaching it is one the institution's own process did not catch. See
[gtm/market.md](gtm/market.md).

### Samarth eGov

A Ministry of Education ERP for higher education institutions, free and widely deployed at
central universities, including a grievance module. The main reason the go-to-market plan
targets private institutions rather than government ones.

### Anti-Ragging Committee / Anti-Ragging Squad

Required by the UGC Regulations on Curbing the Menace of Ragging, 2009, issued pursuant to
a Supreme Court judgment. A national reporting channel exists at
[antiragging.in](https://www.antiragging.in/). SINC-P has the `anti_ragging` track but not
the committee or squad workflow.

---

## Terms specific to this codebase

### Track

Which statutory regime a grievance belongs to: `sgrc`, `icc` or `anti_ragging`. Decides
who may see the case **at all**, before any per-record permission question. Not the same
thing as a category.

### Tenant

One institution. Every tenant-owned row carries `institutionId`, and Postgres row-level
security enforces the boundary beneath the application. See
[verification/tenant-isolation.md](verification/tenant-isolation.md).

### The chain

`grievance_events`, append-only and hash-chained. The source of truth for a grievance's
history; `grievances.status` is a projection kept for query speed. If the two disagree, the
chain wins.

### The clock / the window

The statutory deadline. "The clock" is what the product is sold on, and the phrase appears
throughout the code because "SLA" understates what it is: a legal window, not a service
promise.

### Working days

The UGC 2023 clause counts the SGRC's 15 days as **working** days. The SLA engine skips
Sundays and a configured holiday list, matching the six-day week most Indian colleges run.
Getting this wrong understates every deadline by about a week.
