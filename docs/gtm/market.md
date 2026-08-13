# What already exists

Written after actually going and looking, because "there is nothing like this" is the
most common and most expensive thing a founder believes.

There is quite a lot like this. Two of the alternatives are free and government-backed.
That does not kill the product, but it changes the pitch, and anyone who walks into a
Registrar's office without knowing about them will be corrected in the first five minutes.

---

## 1. UGC e-Samadhaan (free, national, official)

<https://samadhaan.ugc.ac.in/> · [About](https://samadhaan.ugc.ac.in/Pages/AboutUs)

UGC's own centralised single-window grievance portal for students, faculty and other
stakeholders. 24/7 submission, a unique grievance ID for tracking, and a toll-free line
(1800-111-656). UGC consolidated its earlier portals and helplines into it.

**Why it does not compete.** e-Samadhaan is where a student goes when the *institution*
has failed them. It is the escalation tier. An institution accumulating e-Samadhaan
complaints has a problem, not a solution, and the 2023 regulation separately requires the
institution to run **its own** portal. e-Samadhaan produces no internal audit trail an
institution can hand a NAAC team.

**The pitch line this creates:** *"Every complaint that reaches e-Samadhaan is one your
own process did not catch. This is about not being on that list."*

That reframing is worth more than any feature comparison, and it only exists because we
went and read the portal.

---

## 2. Samarth eGov (free, Ministry of Education)

<https://samarth.edu.in/> · [About](https://samarth.edu.in/about/)

An initiative of the Ministry of Education begun in 2019 under the National Mission on
Education through ICT: a fully managed, cloud-hosted, comprehensive ERP purpose-built for
Indian higher education institutions. It includes a grievance module handling grievances,
complaints and malpractices from students, faculty and other stakeholders, with public
submission and status-checking
([example deployment](https://csjmu.samarth.ac.in/index.php/pgportal/grievance-public/create)),
and is deployed at a long list of central universities
([module list](https://www.pondiuni.edu.in/university_news/details-of-the-modules-available-in-the-samarth-egov-erp-suite/)).

**This is the serious one**, and it is the strongest argument for the targeting already
written in [`target-list.md`](target-list.md): **do not sell to government and centrally
funded institutions.** They have a free, ministry-backed ERP with a grievance module and a
procurement process that will outlast your runway. Competing with free, official and
already-installed is not a fight worth picking.

Private and deemed institutions are where Samarth is not the default answer.

**Where a focused product can still win, honestly:** Samarth's grievance module is one
module inside a full ERP. The depth this product goes to on the statutory clock, the
tamper-evident record and the compliance export is a different kind of thing from a
grievance form inside an admissions-and-examinations suite. That is a real difference and
also a narrow one, and it should be stated narrowly.

---

## 3. Commercial campus ERPs

TCS iON, MasterSoft, Academia ERP, Camu, Fedena, IFW Campus ERP
([grievance module](http://ifwworld.com/ifwcampuserp/grievance/)) and others bundle a
grievance module into a wider suite. The typical shape is a submission form, a status
view, and an admin list.

**Do not compete on breadth.** They own admissions, fees, examinations, attendance and
payroll. A college that already runs one of them and uses its grievance module is a poor
prospect, and [`target-list.md`](target-list.md) already lists that as a disqualifier.

**What is genuinely different here**, and the only comparison worth making:

| | Typical ERP grievance module | SINC-P |
|---|---|---|
| Statutory clock | A date field | Working-day counting, category overrides, automatic escalation |
| Record integrity | Editable rows | Append-only, hash-chained, enforced by a database trigger |
| Tenant isolation | Application-level | Postgres RLS, verified firing by a script anyone can run |
| Audit export | A report | Purpose-built for the NAAC 5.1.4 evidence request |
| Transparency to students | None | Published anonymised closure times |
| Cost | Bundled in the ERP | A separate line item, which is a real objection |

That last row is the honest weakness. "We already pay for an ERP that does this" is the
hardest objection in [`objections.md`](objections.md) and the comparison above is the only
answer to it.

---

## 4. The actual incumbent

A spreadsheet, an email address, and whoever in the Registrar's office was free.

This remains the thing to displace, and every alternative above is a reason to be precise
about which institutions still have that setup rather than assuming all of them do. The
qualifying question from the [interview script](launch-plan.md) does the work: *how do you
currently produce that record, and could you show me?*

---

## What the research changed

1. **Targeting sharpened.** Samarth eGov makes government and central institutions a bad
   use of time, for a concrete reason rather than a procurement hunch.
2. **A better opening line.** e-Samadhaan reframes the pitch from "track your complaints"
   to "stay off UGC's list", which is a fear a Registrar already has.
3. **A found feature gap.** NAAC 5.1.4 explicitly says *including sexual harassment and
   ragging cases*, and those are governed by separate laws with separate committees. See
   [`../compliance.md`](../compliance.md). The product cannot fully evidence 5.1.4 today,
   and it must not claim to.
4. **A correctness fix.** The UGC clause says fifteen **working** days. The product was
   counting calendar days and would have reported breaches that had not happened.
