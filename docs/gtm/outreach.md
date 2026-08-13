# First touch

The messages that get the interview from `launch-plan.md` booked. Every one of them asks
for a conversation and offers something useful, and none of them asks for a demo. A demo
request from a stranger is a request for the reader's time in exchange for the sender's
sales pitch, and it is declined for good reason.

Send from a personal address, not a `noreply@`. Sign with a name and a phone number.

---

## 1. Warm, through an alumni or faculty path

The highest-converting message here by a wide margin. Short, because the relationship is
doing the work.

> **Subject: Quick question about grievance records at [Institution]**
>
> Hello [Name],
>
> [Shared context: I was in the 2017 to 2021 CSE batch / we met at the alumni meet in
> March / [Mutual] suggested I write to you.]
>
> My final-year project in 2019 was a student grievance portal. I have spent the last
> few months rebuilding it properly, against the UGC 2023 grievance regulations, and I am
> trying to find out whether the problem I think it solves is a problem anyone actually
> has.
>
> Would you have twenty minutes to tell me how grievances are handled at [Institution]
> today, particularly what happens when NAAC asks to see the records? I am not selling
> anything on this call, and I would rather hear that the current process works fine
> than build something nobody needs.
>
> Siddharth Pandalai
> [phone]

Why it works: it is a request for help, not attention. It states the ask honestly. And
"I would rather hear that it works fine" is the sentence that makes people willing to say
what actually happens.

---

## 2. Cold, to an IQAC Coordinator

The IQAC Coordinator is the champion, not the buyer. They feel the audit-week scramble
directly and they are usually easier to reach than the Registrar.

> **Subject: A twelve-question grievance audit-readiness self-check**
>
> Hello [Name],
>
> I have written a one-page self-assessment on student grievance redressal, built around
> what the UGC 2023 regulations require and what NAAC teams tend to ask for. It is
> attached. There is nothing to sign up for and it is useful whether or not you ever
> speak to me again.
>
> The question most institutions find uncomfortable is number 8: what proportion of
> grievances last year were resolved inside the statutory window, as a number rather than
> an impression.
>
> If that one is awkward at [Institution] too, I would value twenty minutes to hear how
> the records are kept today. I am building an open-source system in this area and I am
> still trying to learn where the real pain is.
>
> Siddharth Pandalai
> [phone] · github.com/darkpandawarrior/SINC-P

Attach `audit-readiness-checklist.md` as a clean PDF. Naming the specific uncomfortable
question is what separates this from every other vendor email: it demonstrates you know
the work rather than the vocabulary.

---

## 3. LinkedIn, first touch

Under 300 characters. No link in the first message; LinkedIn suppresses them and it reads
as a broadcast.

> Hello [Name]. I have built an open-source student grievance redressal system against
> the UGC 2023 regulations, starting from my own final-year project. I am interviewing
> IQAC and Registrar staff about how grievance records are actually kept before I build
> further. Would you be open to twenty minutes?

---

## 4. The follow-up that is not a nudge

One follow-up, seven days later, and it must carry something new. "Just circling back"
is a message that says the sender wants something and has nothing to offer.

> Hello [Name], following up on the note below. Since sending it I have put the whole
> system and its threat model on GitHub, including the parts that are not finished:
> [link]. If the grievance side is not a priority at [Institution] right now, that is a
> genuinely useful answer and I will stop there.

Then stop. A third message converts almost nobody and costs the relationship for the year
when the accreditation cycle actually turns.

---

## 5. The first ten minutes of a demo

Once someone has agreed to see it. The order matters, and it is not the order the product
is built in.

1. **Open on their own answer.** "You said last time it took nine days to pull the
   grievance evidence together for the visit." Their number, their words.
2. **The compliance dashboard first.** Not the login page, not the student portal. The
   screen that answers the question they already told you they cannot answer. Median
   resolution by category, breach count, one-click export.
3. **Then one case.** Open a single grievance and scroll the trail. Say the word
   "tamper-evident" and immediately say what it does not mean. Overclaiming here loses a
   careful buyer permanently, and the careful buyer is the one worth having.
4. **Then the officer queue.** Sorted by what breaches soonest. Point out that resolving
   a case is fewer clicks than replying to an email, because if their staff's day gets
   worse the whole thing fails regardless of the audit trail.
5. **The student side last, and briefly.** It is not what they are buying.
6. **Stop and ask what is missing.** Then actually write it down.

Do not show the transparency page unless they ask, and never lead with it. Publishing
closure times is the right thing to build and a frightening thing to be sold in minute
three. It lands once trust exists, as a choice they can switch on, not as a condition.

---

## What to record after every call

Into `docs/gtm/` or wherever the pipeline lives, within an hour, while it is exact:

- The words they used for the pain. Their phrasing beats yours in every later
  conversation at that institution.
- The number from question 11: days spent assembling evidence last cycle.
- Who else signs.
- What they asked for that does not exist. This is the roadmap, and it is worth more than
  the call.
- Whether they volunteered the pain or agreed with it after prompting. Only the first
  counts toward the kill criteria in `launch-plan.md`.
