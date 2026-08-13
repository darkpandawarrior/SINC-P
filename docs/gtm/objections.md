# Objections

Ten objections that will actually come up in a sales conversation with a Registrar or
IQAC Coordinator, and the straight answer to each. These are written to be said out loud,
not read from a slide.

## 1. "We already have a complaint email / register."

That's not a system, it's a folder. An email inbox can't produce a timestamped record of
who was assigned a complaint, when they acted on it, and whether the SLA in the UGC
Grievance Redressal Regulations was met. When the NAAC or NBA committee asks for that
record, someone reconstructs it by hand from the inbox, once a cycle, under deadline
pressure. That reconstruction is the actual cost of "we already have email," and it's a
cost paid every accreditation cycle, not a one-time setup cost. SINC-P produces that
record continuously, as a byproduct of normal use, so nobody has to reconstruct anything.

## 2. "Our IT policy requires on-premise. We can't put student data on someone else's cloud."

Agreed, and that's already the deployment we recommend for a college in this position.
SINC-P runs as a single Docker Compose command behind whatever nginx setup the college
already has, with no internet dependency for normal operation. This isn't a hosted-only
product that grudgingly offers a self-hosted option. It was built assuming the buyer's IT
admin is a lecturer on rotation with limited time, not a dedicated ops team, which is why
the on-prem path has to be this simple or it doesn't get adopted at all (see ADR-0001 Q4).
If the policy requires the server to sit in the college's own basement, that's the
default answer, not a special case.

## 3. "What happens to our data if you shut down?"

Fair question to ask any vendor, and the honest answer for a solo-engineer-built product
has to be more concrete than "trust us." Three things are true regardless: the pilot
proposal (`pilot-proposal.md`) contractually commits to a full data export in a
non-proprietary format (CSV plus original attachment files) within 10 business days of
request, at any time, not only at contract end. The on-prem deployment option means the
college's data already lives on the college's own server, so "the vendor disappears"
doesn't mean "the data disappears" for anyone who chose that path. And the database schema
and export format are documented, so a college's own IT staff or a successor vendor can
read the data without needing us. This is a real risk with any small vendor and the
honest mitigation is portability, not a promise that nothing will go wrong.

## 4. "Students will abuse anonymous filing, false complaints, harassment of staff."

Two things worth separating here. First, the system doesn't offer blanket anonymous
filing to the SGRC. Every complaint is attributed to an authenticated student account,
so there's always a real identity behind a filing, and that identity is visible to the
committee handling it, per the same UGC framework that governs how a physical complaint
register works today. What's public is the aggregate, anonymised closure-time statistic
(median days to resolve per category), not individual complaint content or identity,
that's the counter-pull that gets students filing in the first place (ADR-0001 Q1), and
it carries none of the abuse risk of true anonymity. Second, a bad-faith complaint is a
process problem that predates this software; the SGRC already has a mechanism for
dismissing an unfounded complaint, and the system just makes that outcome part of the
permanent record instead of an unlogged conversation. A false-complaint problem doesn't
get worse when it's documented. It gets easier to handle consistently.

## 5. "Why not just use Google Forms? It's free."

Google Forms is a good complaint intake box. It is not a grievance-redressal system,
because intake was never the hard part. The hard part is what happens after
submission: routing to the right SGRC member, enforcing the regulatory time-bound
response, escalating to the Ombudsperson tier when that deadline is missed, and producing
a defensible record of all of it for an inspection committee. A spreadsheet of form
responses answers "what did students say" and nothing about "did we handle it on time, by
the right person, and can we prove it." That second question is the entire product.

## 6. "We already have TCS iON / Fedena / Academia. Doesn't that cover this?"

Usually not in practice, even though it's on paper. A grievance module bolted onto a
forty-feature campus ERP is built to be adequate across all forty, not excellent at one,
and the specific things an NAAC/NBA inspector reads closely (a tamper-evident event log,
mandated statutory disclosures, a real time-to-resolution SLA trail) are rarely a general
ERP's design focus. The honest question to ask is whether that module is actually being
used by the SGRC today, or whether it exists in the ERP but the college is still running
grievances by email in practice. If the module is genuinely in active use and working,
this isn't the right sale. We're not trying to replace a working ERP integration. If it's
unused, that's the actual state most tier-2/3 colleges are in, and this product plugs that
specific gap without requiring the college to migrate off the ERP for anything else.

## 7. "This seems expensive for what it is. Can we get a free trial or a lower price?"

The price is set deliberately, not as a maximum-revenue number. A free tier or a
steeply discounted trial signals "unsupported side project" to a buyer who is evaluating,
above all else, who they can hold accountable when a grievance is mishandled during an
audit cycle, see `pricing.md`. What we offer instead is the scoped ₹75,000 pilot: six
weeks, real data, a real compliance-readiness report at the end, priced specifically to
sit under most colleges' single-signature approval threshold so it doesn't need a
committee to approve. That's the low-commitment entry point. It's not free, because free
would undercut the exact credibility the product is selling.

## 8. "Our last accreditation visit went fine without anything like this."

Worth asking what "fine" meant, because most colleges that say this haven't actually been
asked to produce a time-to-resolution record broken down by grievance category, they've
been asked a general question and given a general answer that wasn't pressure-tested.
UGC's grievance redressal regulations and NAAC's criteria on student support and
governance have both gotten more specific over recent accreditation cycles, and the
gap between "we handle complaints" and "we can prove an SLA was met, case by case" is the
gap this closes. It's cheaper to close it now, on a six-week pilot timeline, than to
discover it live in front of an inspection committee at the next cycle.

## 9. "You're one engineer. What if you get busy, or this isn't your full-time thing?"

That's a legitimate concern about any early vendor, and it's better answered with
structure than with reassurance. The exit and data-portability terms in every pilot and
subscription agreement (`pilot-proposal.md` section 7) exist specifically so the college
is never dependent on the relationship continuing to keep its own data usable: full
export, documented schema, no lock-in penalty. The on-prem deployment path means the
software the college depends on daily runs on their own server regardless of what happens
on the vendor side. Neither of those is a promise that nothing goes wrong; they're the
concrete answer to "what's the actual exposure if it does."

## 10. "How do we know a complaining student's identity is protected from retaliation?"

Access to a complaint's content and complainant identity is restricted to the SGRC
members and officers actually assigned to it, enforced in the software, not just as
policy. It's the same role-based access model that governs every tenant-scoped query in the
system. What's published externally is never individual complaint content, only the
aggregate anonymised statistics mentioned in objection 4. This is a stronger protection
than the status quo most colleges have today, where a paper register or an email thread
can be read by anyone with physical or inbox access, with no log of who looked at what.
