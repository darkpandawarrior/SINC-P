# ADR-0002: what AI is allowed to do here

**Date:** 2026-08-14
**Status:** Accepted
**Supersedes nothing. Constrains everything under `src/lib/ai/` and `src/lib/agents/`.**

---

## The temptation, stated so it can be refused

A 2019 complaint portal could not have done any of this. A 2026 one can, and the obvious
move is a chat box: "ask our AI assistant about your grievance". It demos beautifully.

It is also the single fastest way to destroy this product's only real asset. The argument
for SINC-P over a spreadsheet is that its record is defensible. A system that lets a
language model touch a grievance outcome hands every future dispute the same answer:
*the computer decided*. A student whose complaint about ragging was closed by a model has
a second, worse grievance, and this time the institution has no defence at all.

So the AI here is deliberately unglamorous. It reads and suggests. It never writes a
decision.

## The four rules

**1. Off by default.** `AI_PROVIDER` unset means the heuristic provider: local,
deterministic, no network, no model. Every feature still works, slightly worse. An
institution turns a model on knowingly or never.

**2. Nothing decides.** The model suggests a category, flags text that reads as urgent,
and groups grievances that look related. A human sets every status. There is no code path
where a model changes an outcome and there must never be one.

**3. Every suggestion is auditable.** Which provider, which model, what confidence, what
it said. "Why was this filed under Hostel" needs a better answer than "the computer
thought so."

**4. Text is redacted before it leaves the machine.** Names, roll numbers, phone numbers,
Aadhaar, PAN. Under the DPDP Act, sending student grievances to a third-party endpoint is
a decision an institution must take knowingly, and the software should make doing it by
accident hard.

## What got built, and why each one earns its place

### Urgency detection, always local

A keyword pass over every filing for ragging, harassment, threats, discrimination, risk to
life, injury, and safety hazards. Runs regardless of provider, cannot be switched off by
leaving a model unconfigured, and **a model is never allowed to clear a flag it raised**.

The asymmetry is the point. A false positive costs an officer a glance at something
routine. A false negative is a ragging report sitting unread for two days behind a library
card complaint. Those costs are not comparable, so the list is broad on purpose.

### Category suggestion

The dullest work in the product, and the first thing abandoned under pressure. The
council's highest-probability failure was that filing gets easier for students while the
Registrar's day gets worse; triage is where that is won.

Below a confidence floor of 0.45 it says nothing. A wrong pre-selection is worse than an
empty one: it gets accepted by a tired moderator and ends up in the compliance report the
whole product exists to produce.

### Clustering, and the one genuinely new capability

Forty students report the same mess problem. The queue shows forty cases, forty officers
write forty remarks, and the compliance report shows forty closures and a healthy median.
Nobody ever writes the sentence that matters: *the mess has a problem*.

That gap between a ticket tracker and something an institution is actually run with is
the one place this layer does something a 2019 system could not have done at all.

Term overlap, not embeddings. An institution's open grievances number in the hundreds,
Jaccard similarity on a few hundred documents is microseconds, and it needs no model, no
vector store and no GPU. Reach for embeddings when a real deployment shows this failing,
not before.

### The SLA watchdog, the agentic part

Runs on a timer with no human behind it. Finds breached deadlines, escalates up the UGC
ladder, queues notifications, writes an audit event for each action.

Its authority is exactly three verbs: **escalate, notify, record.**

It cannot close a grievance, set a status a human owns, or write anything a student reads
as a decision. An agent that could resolve cases would become the fastest route to a clean
compliance report, and a clean report nobody earned is precisely the fraud this system
exists to make difficult.

Every action it takes appends to the same hash chain a human action would, with `actorId`
null and the agent named in the payload. "The system escalated it" has to be as auditable
as "the Registrar escalated it", or the trail has a hole exactly where the awkward
questions land.

## Rejected

**A student-facing chatbot.** The failure mode is a model confidently telling a student
their grievance is out of scope, or paraphrasing a statutory timeline wrongly. The
handbook already answers questions, and it answers them in words a human wrote and an
office owns.

**AI-drafted responses to students.** Tempting for an overloaded officer and corrosive:
the remark is the institution's formal position on a grievance, and a generated one is
nobody's position. The officer writes it or it does not get written.

**AI-generated compliance narrative.** A paragraph summarising the year's grievance
performance, for the self-study report. Rejected because it is a document an institution
signs and submits to a regulator, and a plausible-sounding generated sentence in it is a
liability with the institution's name on it, not ours.

**Embeddings and a vector store.** Not yet, on YAGNI grounds. Named here so the decision
is visible rather than accidental.

**Sentiment scoring on grievances.** Measures nothing anyone can act on and invites
ranking students' distress.

## The honest weaknesses

- **Redaction reduces risk, it does not remove it.** "The warden of Block C on the night
  of the 14th" identifies a person and no regular expression will catch it. This is why
  the remote provider is off by default and why the documentation says to run the model on
  the institution's own hardware.
- **The keyword urgency list is English-only.** A grievance written in Hindi or
  transliterated Hinglish will not trip it. That is a real gap for the target market and
  it is on the roadmap rather than solved.
- **Clustering is monolingual and lexical.** Two reports of the same problem in different
  words will not group.
- **The watchdog has no dry-run.** `--dry` currently prints a warning telling you to run
  against a copy of the database. An agent that emails a Registrar's whole committee is
  not something to discover in production, so this should be a real no-write path.

## What would change this decision

A design partner asking for generated drafts, with their own review step, and accepting in
writing that the institution owns the output. Until someone asks, the constraint stays,
because it costs almost nothing and protects the only thing this product sells.
