# From 2019 to 2026

An accounting of what the original SINC-P did, what was wrong with it, and what replaced
it. Written without gloating: the 2019 code was a group of undergraduates learning to
ship, and it did ship. The point of this document is that the failure modes below are
*ordinary* — they are what a PHP tutorial in 2016 taught, and they are still in
production at institutions today.

## Construct by construct

| 2019 | 2026 | The actual vulnerability |
|---|---|---|
| `mysqli_query($con, "SELECT * FROM users WHERE userEmail='".$_POST['username']."'")` | Drizzle with bound parameters, plus RLS beneath it | **SQL injection, unauthenticated.** `' OR '1'='1' -- ` in the login form returns the first user row and logs you in as them. Every query in the original was built this way. |
| `md5($_POST['password'])`, no salt | scrypt, N=2^16, per-password salt, parameters stored with the hash | **Instant offline recovery.** Unsalted md5 falls to a rainbow table in seconds, and identical passwords produced identical hashes, so the dump also revealed which users shared one. |
| `admin/` copy-pasted to `Director/` | One console, one role enum, `policy.ts` deciding what each role may do | Two divergent copies of the same 40 files. A fix applied to one was not applied to the other, and the SRS's escalation ladder was never actually built. |
| `complaint-details.php?cid=5` rendering whatever came back | `canView(actor, grievance)` on every read path, RLS underneath | **IDOR.** Any logged-in student read every other student's grievances by counting upwards. No ownership check existed anywhere. |
| `if (strlen($_SESSION['login']) == 0) header('location:index.php')` | Server-side session records, role checked per route group via `_lib/actor.ts` | Authorisation was *which directory the file lived in*. A student who guessed an `/admin/` URL was stopped only by the logged-in check, which passed. |
| `move_uploaded_file($_FILES["compfile"]["tmp_name"], "complaintdocs/".$_FILES["compfile"]["name"])` | Storage outside the web root, opaque keys, magic-byte sniffing, size cap enforced while streaming, per-download authorisation | **Remote code execution.** Upload `shell.php`, then request it. The server runs it. This is the single most severe bug in the original. |
| `complaintremark` table, editable in place | `grievance_events`, append-only and hash-chained, enforced by a database trigger | An officer could rewrite a past remark and claim it always said that. In a compliance product that is the whole ballgame. |
| `status varchar(50)`, `NULL` meaning pending, values `'in process'` / `'closed'` | `grievance_status` enum plus an explicit transition matrix | Free text meant the dashboard had to query `WHERE status is null`, and no transition was ever illegal. A closed grievance could silently reopen. |
| Password reset by matching email **and phone number** | Single-use token, SHA-256 stored, 30 minute expiry, all sessions destroyed on use | **Account takeover by anyone who knew a student's phone number.** There was no token at all. |
| `error_reporting(0)` | Errors surface in dev, structured logging in production | Silencing errors does not remove them, it removes your ability to see them. |
| `userlog` with the IP written as text into a `binary(16)` | `auth_events` with kind, actor, IP, user agent, and structured detail | The original logged logins and nothing else. No record of denials, exports, or password changes. |
| No CSRF protection | Double-submit cookie, constant-time comparison, checked in every mutating action | Any page on the internet could file a grievance, or close one, as a logged-in user. |
| Categories: `E-commerce`, `Online Shopping`, `E-wallet` | A real campus tree, per-institution, with SLA overrides and a `isSensitive` flag | Not a vulnerability, but the clearest evidence the template was never adapted: the seed data in the original repository is still the vendor's e-commerce demo. |

## Data migration

`scripts/import-legacy.ts` reads an actual 2019 `cms.sql` dump. It is a dry run unless
given `--commit`, because the likeliest way to lose a college's grievance history is to
run an importer against the wrong tenant.

| 2019 table | Becomes |
|---|---|
| `users` | `users`, role `student` |
| `admin` | `users`, role `institution_admin` |
| `category` | `categories`, `parentId` null |
| `subcategory` | `categories` with a parent |
| `tblcomplaints` | `grievances`, reference `LEGACY-<year>-<n>` |
| `complaintremark` | `grievance_events`, replayed in date order into a valid chain |
| `state` | dropped — an address field inherited from the e-commerce template |
| `userlog` | dropped — superseded by `auth_events`, no history worth keeping |

Three decisions worth stating plainly:

**Password hashes are not migrated.** Carrying md5 across would import the
vulnerability with the data. Every imported user arrives deactivated with an unusable
random hash and must go through reset. This makes go-live day noisy and it is still
correct.

**No SLA is back-dated.** An imported grievance gets `dueAt = null` rather than an
invented statutory deadline. Fabricating a due date for a grievance filed in 2018 would
inject fictional breaches into the first compliance report, which is the exact opposite
of what this product is for.

**Unrecognised statuses become `submitted`, not dropped.** Losing a grievance during
migration is worse than misfiling one, and the original free-text value is preserved in
the event payload.

Every imported grievance gets a well-formed chain starting from an explicit `submitted`
event, and `verifyChain` runs over each one *before* the write. A chain that will not
verify at import time will never verify later, and an auditor finding it then is far
more expensive than failing the import now.

## What the parser taught

The importer's tuple reader was written, tested against tidy synthetic SQL, and passed.
Then it was pointed at the real dump and a test failed: the genuine data contains
`complaintType = ' Complaint'` with a leading space, and `.trim()` was silently
rewriting imported records.

The lesson generalises past this file. Test against the artefact you actually have, not
a clean version of it you wrote yourself.
