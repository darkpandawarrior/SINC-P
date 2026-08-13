/**
 * Import a 2019-era SINC-P / PHP complaint-portal MySQL dump into the v2 schema.
 *
 * Usage:
 *   tsx scripts/import-legacy.ts --sql ./cms.sql --institution <uuid> [--commit]
 *
 * Dry run by default. Nothing is written without --commit, because the most likely way
 * to lose a college's grievance history is to run an importer against the wrong tenant.
 *
 * What this does NOT do, deliberately:
 *
 *   Password hashes are not migrated. The old table stored bare md5() with no salt, and
 *   carrying those across would import the vulnerability along with the data. Every user
 *   is created deactivated with a random unusable password and must go through reset.
 *   This is the correct answer even though it makes the first login day noisy.
 *
 * The 2019 schema is mapped as follows:
 *
 *   users            -> users (role student)
 *   admin            -> users (role institution_admin)
 *   category         -> categories (parentId null)
 *   subcategory      -> categories (parentId = the parent category)
 *   tblcomplaints    -> grievances
 *   complaintremark  -> grievance_events, replayed in date order into a valid hash chain
 *   state, userlog   -> dropped. `state` was an address field on an e-commerce template;
 *                       `userlog` is superseded by auth_events and carries no history
 *                       worth importing.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, withTenant, withoutTenantScope } from '../src/db/client'
import {
  categories,
  grievanceEvents,
  grievances,
  institutions,
  users,
  type Grievance,
} from '../src/db/schema'
import { nextEvent, verifyChain } from '../src/lib/grievance/audit'

// ---------------------------------------------------------------------------
// mysqldump parsing
// ---------------------------------------------------------------------------

/**
 * Pull the row tuples out of `INSERT INTO \`table\` (...) VALUES (...),(...);`
 *
 * A real SQL parser would be the right tool if this ran often. It runs once per
 * customer migration, against a dump produced by phpMyAdmin, so a focused tokeniser
 * that understands quoting and escapes is enough.
 * ponytail: hand-rolled tuple reader, swap for a real parser if we ever import
 * dumps we did not eyeball first.
 */
export function parseInserts(sqlText: string, table: string): string[][] {
  const rows: string[][] = []
  // Match the statement head for this table only, then read tuples until the ';'.
  const head = new RegExp(`INSERT INTO \`?${table}\`?\\s*\\([^)]*\\)\\s*VALUES`, 'gi')

  // The match itself is never read: `head.lastIndex` is what drives the tuple reader
  // below, so the loop only needs to know that another statement head exists.
  while (head.exec(sqlText) !== null) {
    let i = head.lastIndex
    let current: string[] | null = null
    let field = ''
    let inString = false
    let done = false
    // Whitespace inside quotes is data — the real dump has complaintType = ' Complaint'
    // with a leading space. Only unquoted tokens (numbers, NULL) get trimmed.
    let quoted = false
    const flush = () => {
      if (!current) return
      current.push(quoted ? field : field.trim())
      field = ''
      quoted = false
    }

    while (i < sqlText.length && !done) {
      const ch = sqlText[i]!

      if (inString) {
        if (ch === '\\') {
          // mysqldump escapes with backslashes: \' \" \\ \n \r \0
          const next = sqlText[i + 1]
          field += next === 'n' ? '\n' : next === 'r' ? '\r' : next === '0' ? '\0' : (next ?? '')
          i += 2
          continue
        }
        if (ch === "'") {
          // Doubled quote is a literal quote.
          if (sqlText[i + 1] === "'") {
            field += "'"
            i += 2
            continue
          }
          inString = false
          i++
          continue
        }
        field += ch
        i++
        continue
      }

      switch (ch) {
        case "'":
          inString = true
          quoted = true
          // Drop the separator whitespace that preceded the quote; everything from
          // here to the closing quote is literal.
          field = ''
          i++
          break
        case '(':
          current = []
          field = ''
          quoted = false
          i++
          break
        case ',':
          flush()
          i++
          break
        case ')':
          if (current) {
            flush()
            rows.push(current)
            current = null
          }
          i++
          break
        case ';':
          done = true
          i++
          break
        default:
          if (current) field += ch
          i++
      }
    }
    head.lastIndex = i
  }
  return rows
}

/** mysqldump writes unquoted NULL; quoted values arrive already unwrapped. */
const nullable = (v: string | undefined): string | null =>
  v === undefined || v === 'NULL' || v === '' ? null : v

/**
 * The old `status` column: NULL meant pending, and the rest were free text with
 * inconsistent casing. This is the mapping that makes the legacy rows land in the new
 * state machine rather than beside it.
 */
export function mapStatus(legacy: string | null): Grievance['status'] {
  const s = (legacy ?? '').trim().toLowerCase()
  if (s === '' ) return 'submitted'          // NULL-means-pending
  if (s === 'in process') return 'in_progress'
  if (s === 'closed') return 'closed'
  if (s === 'resolved') return 'resolved'
  if (s === 'rejected') return 'rejected'
  // Anything unrecognised becomes submitted rather than being dropped. Losing a
  // grievance during migration is worse than misfiling one, and the event trail
  // preserves whatever the original string was.
  return 'submitted'
}

const parseDate = (v: string | null): Date => {
  if (!v || v.startsWith('0000')) return new Date(0)
  const d = new Date(v.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface Args {
  sql: string
  institution: string
  commit: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i === -1 ? undefined : argv[i + 1]
  }
  const sql = get('--sql')
  const institution = get('--institution')
  if (!sql || !institution) {
    throw new Error('usage: tsx scripts/import-legacy.ts --sql <dump.sql> --institution <uuid> [--commit]')
  }
  return { sql, institution, commit: argv.includes('--commit') }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const text = readFileSync(args.sql, 'utf8')

  const inst = await withoutTenantScope('legacy import target lookup', (tx) =>
    tx.select().from(institutions).where(eq(institutions.id, args.institution)).limit(1),
  )
  if (!inst[0]) throw new Error(`institution ${args.institution} not found`)
  const institutionId = inst[0].id

  const legacyUsers = parseInserts(text, 'users')
  const legacyAdmins = parseInserts(text, 'admin')
  const legacyCats = parseInserts(text, 'category')
  const legacySubcats = parseInserts(text, 'subcategory')
  const legacyComplaints = parseInserts(text, 'tblcomplaints')
  const legacyRemarks = parseInserts(text, 'complaintremark')

  console.log(`Parsed from ${args.sql}:`)
  console.log(`  users            ${legacyUsers.length}`)
  console.log(`  admin            ${legacyAdmins.length}`)
  console.log(`  category         ${legacyCats.length}`)
  console.log(`  subcategory      ${legacySubcats.length}`)
  console.log(`  tblcomplaints    ${legacyComplaints.length}`)
  console.log(`  complaintremark  ${legacyRemarks.length}`)
  console.log(`  -> institution   ${inst[0].name}`)

  if (!args.commit) {
    console.log('\nDRY RUN. Nothing written. Re-run with --commit to apply.')
    await db.$client.end()
    return
  }

  await withTenant(institutionId, async (tx) => {
    // --- users -------------------------------------------------------------
    // id -> new uuid, so complaint.userId can be rewired.
    const userIdMap = new Map<string, string>()

    for (const row of legacyUsers) {
      const [legacyId, fullName, email] = row
      if (!legacyId || !email) continue
      const [created] = await tx
        .insert(users)
        .values({
          institutionId,
          email: email.toLowerCase(),
          fullName: nullable(fullName) ?? email,
          role: 'student',
          // Unusable placeholder. The md5 hash is deliberately not carried over.
          passwordHash: `scrypt$65536$8$1$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`,
          isActive: false,
        })
        .onConflictDoNothing()
        .returning({ id: users.id })
      if (created) userIdMap.set(legacyId, created.id)
    }

    for (const row of legacyAdmins) {
      const [legacyId, username] = row
      if (!legacyId || !username) continue
      const email = username.includes('@') ? username : `${username}@imported.invalid`
      const [created] = await tx
        .insert(users)
        .values({
          institutionId,
          email: email.toLowerCase(),
          fullName: username,
          role: 'institution_admin',
          passwordHash: `scrypt$65536$8$1$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`,
          isActive: false,
        })
        .onConflictDoNothing()
        .returning({ id: users.id })
      if (created) userIdMap.set(`admin:${legacyId}`, created.id)
    }

    // --- categories --------------------------------------------------------
    const catIdMap = new Map<string, string>()
    for (const row of legacyCats) {
      const [legacyId, name, description] = row
      if (!legacyId || !name) continue
      const [created] = await tx
        .insert(categories)
        .values({ institutionId, parentId: null, name, description: nullable(description) })
        .returning({ id: categories.id })
      if (created) catIdMap.set(legacyId, created.id)
    }

    // Subcategories were keyed by name on the complaint row, not by id, so index both.
    const subcatByName = new Map<string, string>()
    for (const row of legacySubcats) {
      const [, parentLegacyId, name] = row
      if (!parentLegacyId || !name) continue
      const parentId = catIdMap.get(parentLegacyId) ?? null
      const [created] = await tx
        .insert(categories)
        .values({ institutionId, parentId, name })
        .returning({ id: categories.id })
      if (created) subcatByName.set(name.toLowerCase(), created.id)
    }

    // --- complaints --------------------------------------------------------
    const grievanceIdMap = new Map<string, string>()
    const year = new Date().getFullYear()
    let n = 0

    for (const row of legacyComplaints) {
      const [legacyNo, legacyUserId, legacyCat, subcatName, , , noc, details, , regDate, status] =
        row
      if (!legacyNo) continue

      n += 1
      const submittedAt = parseDate(nullable(regDate))
      const categoryId =
        subcatByName.get((subcatName ?? '').toLowerCase()) ??
        catIdMap.get(legacyCat ?? '') ??
        null

      const [created] = await tx
        .insert(grievances)
        .values({
          institutionId,
          reference: `LEGACY-${year}-${String(n).padStart(5, '0')}`,
          submittedById: userIdMap.get(legacyUserId ?? '') ?? null,
          categoryId,
          kind: 'grievance',
          // The old form had a short `noc` field and a long `complaintDetails`.
          subject: (nullable(noc) ?? nullable(details) ?? 'Imported grievance').slice(0, 200),
          body: nullable(details) ?? '',
          status: mapStatus(nullable(status)),
          // No SLA is back-dated onto imported rows: inventing a statutory deadline for
          // a grievance filed in 2018 would put fabricated breaches into the compliance
          // report, which is the opposite of what this product is for.
          dueAt: null,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        })
        .returning({ id: grievances.id })

      if (created) grievanceIdMap.set(legacyNo, created.id)
    }

    // --- remarks replayed as a hash chain ----------------------------------
    const remarksByComplaint = new Map<string, string[][]>()
    for (const row of legacyRemarks) {
      const key = row[1] ?? ''
      const list = remarksByComplaint.get(key) ?? []
      list.push(row)
      remarksByComplaint.set(key, list)
    }

    let chained = 0
    for (const [legacyNo, grievanceId] of grievanceIdMap) {
      const submittedAt = parseDate(
        nullable(legacyComplaints.find((r) => r[0] === legacyNo)?.[9]),
      )

      let prev: { seq: number; hash: string } | null = null
      const built: Array<ReturnType<typeof nextEvent>> = []

      // Every imported grievance starts with an explicit 'submitted' event so its chain
      // is well-formed even when the old table had no remarks at all.
      const first = nextEvent(prev, {
        grievanceId,
        type: 'submitted',
        actorId: null,
        remark: 'Imported from the 2019 portal.',
        payload: { imported: true, legacyComplaintNumber: legacyNo },
        createdAt: submittedAt,
      })
      built.push(first)
      prev = { seq: first.seq, hash: first.hash }

      const rows = (remarksByComplaint.get(legacyNo) ?? []).sort(
        (a, b) => parseDate(nullable(a[4])).getTime() - parseDate(nullable(b[4])).getTime(),
      )

      for (const r of rows) {
        const [, , legacyStatus, remark, remarkDate] = r
        const e = nextEvent(prev, {
          grievanceId,
          type: 'status_changed',
          actorId: null,
          remark: nullable(remark),
          payload: { imported: true, legacyStatus: nullable(legacyStatus) },
          createdAt: parseDate(nullable(remarkDate)),
        })
        built.push(e)
        prev = { seq: e.seq, hash: e.hash }
      }

      // Verify before writing. A chain that does not verify at import time will never
      // verify later, and an auditor finding it then is far more expensive.
      const verdict = verifyChain(built)
      if (!verdict.ok) {
        throw new Error(`chain build failed for legacy complaint ${legacyNo}: ${verdict.reason}`)
      }

      for (const e of built) {
        await tx.insert(grievanceEvents).values({
          institutionId,
          grievanceId,
          seq: e.seq,
          type: e.type as never,
          actorId: e.actorId,
          actorRole: null,
          remark: e.remark,
          visibility: 'public',
          payload: e.payload,
          prevHash: e.prevHash,
          hash: e.hash,
          createdAt: e.createdAt,
        })
      }
      chained += built.length
    }

    console.log(`\nImported:`)
    console.log(`  users       ${userIdMap.size}`)
    console.log(`  categories  ${catIdMap.size + subcatByName.size}`)
    console.log(`  grievances  ${grievanceIdMap.size}`)
    console.log(`  events      ${chained} (all chains verified)`)
    console.log(`\nEvery imported user is deactivated with an unusable password.`)
    console.log(`Send them through password reset before go-live.`)
  })

  await db.$client.end()
}

if (process.argv[1]?.endsWith('import-legacy.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
