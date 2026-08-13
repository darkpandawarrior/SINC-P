/**
 * Seed + demo data.
 *
 * This is also the reviewer's proof that tenant isolation actually works: two
 * institutions with disjoint users, categories and grievances, seeded through the same
 * `withTenant` every request goes through, plus an explicit cross-tenant read attempt
 * at the end that has to come back empty.
 *
 * ~40 grievances (20 per institution) spread across every status and a range of ages,
 * so the compliance dashboard has real shape: on-track, due-soon, breached, resolved,
 * closed, appealed, rejected. Every one gets a hash-chained event history built with the
 * real audit helpers, and `verifyChain` runs over all of it at the end — if that check
 * ever fails, this script exits non-zero rather than leaving broken demo data behind.
 *
 * Idempotent per institution: an institution that already exists (by slug) is left
 * alone. Re-running after a fresh `docker compose up` is safe; re-running against a
 * database that already has these two institutions is a no-op for seeding and just
 * re-verifies and reprints credentials.
 *
 * The 2019 seed data carried the PHP template's e-commerce categories ("Online
 * Shopping", "E-wallet") into a college complaints portal because nobody adapted the
 * taxonomy. CATEGORY_TREE below is that fix.
 */
import { eq } from 'drizzle-orm'
import { pool, withTenant, withoutTenantScope, type Tx } from '../src/db/client'
import {
  institutions,
  users,
  categories,
  grievances,
  grievanceEvents,
  announcements,
  handbookEntries,
  type Grievance,
  type GrievanceEvent,
  type User,
} from '../src/db/schema'
import { hashPassword } from '../src/lib/auth/password'
import { nextEvent, verifyChain } from '../src/lib/grievance/audit'
import { canTransition } from '../src/lib/grievance/policy'

const DEV_PASSWORD = 'SincpDemo#2026'

type Role = User['role']
type Status = Grievance['status']
type EventKind = GrievanceEvent['type']
type ActorRole = GrievanceEvent['actorRole']
type EventVisibility = GrievanceEvent['visibility']

// ---------------------------------------------------------------------------
// Institutions and people
// ---------------------------------------------------------------------------
// Two fictional colleges, not real ones — this is demo data with fake emails and a
// printed dev password, and it should never be mistaken for a real institution's
// records. Different name pools per institution so a reviewer can tell at a glance
// which rows belong to which tenant.

interface InstitutionSeed {
  slug: string
  name: string
  refPrefix: string
  slaResolutionDays: number
  students: string[]
  moderator: string
  officers: string[]
  ombudsperson: string
  admin: string
}

const INSTITUTIONS: InstitutionSeed[] = [
  {
    slug: 'rit-bhopal',
    name: 'Rajendra Institute of Technology, Bhopal',
    refPrefix: 'RITB',
    slaResolutionDays: 15,
    students: ['Aarav Sharma', 'Priya Verma', 'Rohan Mehta', 'Sneha Kulkarni', 'Vikram Nair'],
    moderator: 'Anjali Rao',
    officers: ['Suresh Iyer', 'Kavita Desai'],
    ombudsperson: 'Dr. Ramesh Chandran',
    admin: 'Meera Joshi',
  },
  {
    slug: 'vindhya-college',
    name: 'Vindhya College of Engineering',
    refPrefix: 'VCE',
    slaResolutionDays: 15,
    students: ['Aditya Singh', 'Neha Kapoor', 'Karan Malhotra', 'Divya Reddy', 'Arjun Bose'],
    moderator: 'Pooja Menon',
    officers: ['Manoj Pillai', 'Ritu Agarwal'],
    ombudsperson: 'Dr. Sunil Bhatia',
    admin: 'Deepa Krishnan',
  },
]

// ---------------------------------------------------------------------------
// Category tree — realistic Indian engineering-college taxonomy
// ---------------------------------------------------------------------------

interface CategoryDef {
  name: string
  isSensitive?: boolean
  slaResolutionDays?: number
  children?: string[]
}

const CATEGORY_TREE: CategoryDef[] = [
  { name: 'Hostel & Mess', children: ['Mess Food Quality', 'Room Allotment & Maintenance'] },
  {
    name: 'Academics & Examination',
    children: ['Grade / Revaluation Dispute', 'Exam Scheduling Conflict'],
  },
  { name: 'Fees & Scholarship' },
  { name: 'Infrastructure' },
  // Bypasses moderator triage in the timeline below and carries a short SLA — this is
  // the category the whole "genuinely breached" demo grievance leans on.
  { name: 'Ragging & Harassment', isSensitive: true, slaResolutionDays: 5 },
  { name: 'Placement' },
  { name: 'Transport' },
  { name: 'Library' },
]

interface Leaf {
  id: string
  name: string
  isSensitive: boolean
  slaResolutionDays: number
}

async function seedCategories(tx: Tx, institutionId: string, institutionSlaDays: number): Promise<Leaf[]> {
  const leaves: Leaf[] = []

  for (const def of CATEGORY_TREE) {
    const [parent] = await tx
      .insert(categories)
      .values({
        institutionId,
        name: def.name,
        isSensitive: def.isSensitive ?? false,
        slaResolutionDays: def.slaResolutionDays ?? null,
      })
      .returning()
    if (!parent) throw new Error(`failed to insert category ${def.name}`)

    if (!def.children) {
      leaves.push({
        id: parent.id,
        name: parent.name,
        isSensitive: parent.isSensitive,
        slaResolutionDays: parent.slaResolutionDays ?? institutionSlaDays,
      })
      continue
    }

    for (const childName of def.children) {
      const [child] = await tx
        .insert(categories)
        .values({
          institutionId,
          parentId: parent.id,
          name: childName,
          isSensitive: def.isSensitive ?? false,
          slaResolutionDays: def.slaResolutionDays ?? null,
        })
        .returning()
      if (!child) throw new Error(`failed to insert category ${childName}`)
      leaves.push({
        id: child.id,
        name: child.name,
        isSensitive: child.isSensitive,
        slaResolutionDays: child.slaResolutionDays ?? institutionSlaDays,
      })
    }
  }

  return leaves
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface SeededPerson {
  id: string
  email: string
  role: Role
}

interface SeededPeople {
  students: SeededPerson[]
  moderator: SeededPerson
  officers: SeededPerson[]
  ombudsperson: SeededPerson
  admin: SeededPerson
}

function emailFor(name: string, slug: string): string {
  const local = name
    .toLowerCase()
    .replace(/^dr\.\s*/, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.')
  // A domain that cannot resolve to anything real, on purpose.
  return `${local}@${slug}.sincp.demo`
}

async function seedUsers(
  tx: Tx,
  institutionId: string,
  seed: InstitutionSeed,
  passwordHash: string,
): Promise<SeededPeople> {
  async function create(name: string, role: Role, rollNumber: string | null): Promise<SeededPerson> {
    const [row] = await tx
      .insert(users)
      .values({
        institutionId,
        email: emailFor(name, seed.slug),
        fullName: name,
        rollNumber,
        role,
        passwordHash,
        department: role === 'student' ? 'Computer Science & Engineering' : null,
        isActive: true,
        emailVerifiedAt: new Date(),
      })
      .returning()
    if (!row) throw new Error(`failed to insert user ${name}`)
    return { id: row.id, email: row.email, role: row.role }
  }

  const students: SeededPerson[] = []
  for (const [i, name] of seed.students.entries()) {
    students.push(await create(name, 'student', `${seed.refPrefix}22CS${String(i + 1).padStart(3, '0')}`))
  }

  const moderator = await create(seed.moderator, 'moderator', null)
  const officers: SeededPerson[] = []
  for (const name of seed.officers) officers.push(await create(name, 'redressal_officer', null))
  const ombudsperson = await create(seed.ombudsperson, 'ombudsperson', null)
  const admin = await create(seed.admin, 'institution_admin', null)

  return { students, moderator, officers, ombudsperson, admin }
}

// ---------------------------------------------------------------------------
// Grievance content, cycled per category leaf
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  'Mess Food Quality': {
    subject: 'Stale food served in mess for three consecutive days',
    body: 'The dinner mess has served undercooked rice and watery dal since Monday. Several students in Block C reported stomach upset after Tuesday\'s dinner.',
  },
  'Room Allotment & Maintenance': {
    subject: 'Room ceiling fan not working for two weeks',
    body: 'Reported verbally to the warden on the 3rd with no action taken. Peak summer heat is making the room unusable at night.',
  },
  'Grade / Revaluation Dispute': {
    subject: 'Marks not updated after revaluation',
    body: 'Revaluation was applied for on the portal three weeks ago. The result still shows the original marks and the exam cell is not responding to emails.',
  },
  'Exam Scheduling Conflict': {
    subject: 'Two end-semester papers scheduled in the same slot',
    body: 'The published datesheet has two core papers scheduled for the same date and time slot, affecting the whole batch.',
  },
  'Fees & Scholarship': {
    subject: 'Scholarship disbursement pending since last semester',
    body: 'The scholarship was approved on the state portal in October but the institute has not adjusted it against the fee due, and a late fee is now being charged on top.',
  },
  Infrastructure: {
    subject: 'Water leakage in the corridor near the physics lab',
    body: 'Standing water near an exposed switchboard is a safety hazard. Reported to the estate office a week ago.',
  },
  'Ragging & Harassment': {
    subject: 'Senior students calling first-years out of their rooms after curfew',
    body: 'A group of second-year students has been summoning first-year hostel residents after 11pm. Filing anonymously out of concern for retaliation.',
  },
  Placement: {
    subject: 'Placement cell did not share the interview shortlist on time',
    body: 'The shortlist for the campus drive was published two hours after interviews began, and several eligible students missed their slot.',
  },
  Transport: {
    subject: 'Institute bus route consistently 40 minutes late',
    body: 'The evening bus to the city has been arriving 30-40 minutes late all week, making day scholars miss the last connecting bus home.',
  },
  Library: {
    subject: 'Reference-section access card not working',
    body: 'The RFID card for reference-only section access has stopped working since the system upgrade, and the help desk has no ETA.',
  },
}

// ---------------------------------------------------------------------------
// Grievances + hash-chained event histories
// ---------------------------------------------------------------------------

type Bucket = 'on_track' | 'due_soon' | 'breached' | 'resolved_closed' | 'appealed' | 'rejected'

// 20 per institution: 6 on track, 4 due soon, 5 breached, 3 resolved+closed,
// 1 appealed to the Ombudsperson, 1 rejected outright.
const BUCKET_PLAN: Bucket[] = [
  'on_track', 'on_track', 'on_track', 'on_track', 'on_track', 'on_track',
  'due_soon', 'due_soon', 'due_soon', 'due_soon',
  'breached', 'breached', 'breached', 'breached', 'breached',
  'resolved_closed', 'resolved_closed', 'resolved_closed',
  'appealed',
  'rejected',
]

/**
 * How many times to repeat the bucket shape per institution.
 *
 * One pass (20 grievances) spreads about two per category, which is below the
 * five-grievance threshold the transparency page suppresses at — so the whole public
 * page renders as a wall of "—". That is the privacy rule working correctly, but it
 * demos terribly and hides the SLA medians entirely. Five passes puts every category
 * over the threshold while keeping the same status and age distribution.
 */
const SEED_REPEATS = Number(process.env.SEED_REPEATS ?? 5)

const FULL_PLAN: Bucket[] = Array.from({ length: SEED_REPEATS }, () => BUCKET_PLAN).flat()

const DAY_MS = 86_400_000

interface EventDraft {
  type: EventKind
  actorId: string | null
  actorRole: ActorRole
  remark: string | null
  payload: Record<string, unknown> | null
  visibility: EventVisibility
  createdAt: Date
}

/** Runs the drafts through the real hash-chain helper in insertion order. */
function chainEvents(grievanceId: string, drafts: EventDraft[]) {
  let previous: { seq: number; hash: string } | null = null
  const out: Array<EventDraft & { grievanceId: string; seq: number; prevHash: string | null; hash: string }> = []

  for (const d of drafts) {
    const built = nextEvent(previous, {
      grievanceId,
      type: d.type,
      actorId: d.actorId,
      remark: d.remark,
      payload: d.payload,
      createdAt: d.createdAt,
    })
    out.push({ ...d, grievanceId: built.grievanceId, seq: built.seq, prevHash: built.prevHash, hash: built.hash })
    previous = { seq: built.seq, hash: built.hash }
  }

  return out
}

function submittedDaysAgo(bucket: Bucket, sla: number, i: number): number {
  switch (bucket) {
    case 'on_track':
      return Math.max(1, Math.floor(sla * 0.3)) + (i % 3)
    case 'due_soon':
      return Math.max(1, sla - 1 - (i % 2))
    case 'breached':
      return sla + 6 + (i % 5)
    case 'resolved_closed':
      return sla + 12 + (i % 4)
    case 'appealed':
      return sla + 18
    case 'rejected':
      return 4 + (i % 3)
  }
}

async function seedGrievances(
  tx: Tx,
  institutionId: string,
  seed: InstitutionSeed,
  leaves: Leaf[],
  people: SeededPeople,
): Promise<void> {
  const now = new Date()

  for (const [i, bucket] of FULL_PLAN.entries()) {
    const leaf = leaves[i % leaves.length]!
    const template = TEMPLATES[leaf.name]!
    const student = people.students[i % people.students.length]!
    const officer = people.officers[i % people.officers.length]!
    const sla = leaf.slaResolutionDays

    const createdAt = new Date(now.getTime() - submittedDaysAgo(bucket, sla, i) * DAY_MS)
    const dueAt = new Date(createdAt.getTime() + sla * DAY_MS)
    const isAnonymous = leaf.name === 'Ragging & Harassment'

    const drafts: EventDraft[] = []
    const push = (offsetDays: number, d: Omit<EventDraft, 'createdAt'>) =>
      drafts.push({ ...d, createdAt: new Date(createdAt.getTime() + offsetDays * DAY_MS) })

    let status: Status = 'submitted'
    const advance = (to: Status) => {
      if (!canTransition(status, to)) throw new Error(`illegal seed transition ${status} -> ${to}`)
      status = to
    }

    let assignedToId: string | null = null
    let resolvedAt: Date | null = null
    let closedAt: Date | null = null
    let satisfactionRating: number | null = null

    push(0, {
      type: 'submitted',
      actorId: student.id,
      actorRole: 'student',
      remark: null,
      payload: { categoryId: leaf.id },
      visibility: 'public',
    })

    if (bucket === 'rejected') {
      advance('rejected')
      push(1, {
        type: 'status_changed',
        actorId: people.moderator.id,
        actorRole: 'moderator',
        remark: 'Rejected: outside SGRC scope, matter is already under a separate academic appeal.',
        payload: { from: 'submitted', to: 'rejected' },
        visibility: 'public',
      })
    } else {
      advance('under_review')
      push(0.5, {
        type: 'status_changed',
        actorId: people.moderator.id,
        actorRole: 'moderator',
        remark: leaf.isSensitive
          ? 'Sensitive category: routed directly to a redressal officer, triage bypassed.'
          : 'Screened and routed to a redressal officer.',
        payload: { from: 'submitted', to: 'under_review' },
        visibility: 'internal',
      })

      advance('in_progress')
      assignedToId = officer.id
      push(1, {
        type: 'assigned',
        actorId: people.moderator.id,
        actorRole: 'moderator',
        remark: null,
        payload: { assigneeId: officer.id },
        visibility: 'internal',
      })
      push(1, {
        type: 'status_changed',
        actorId: officer.id,
        actorRole: 'redressal_officer',
        remark: 'Taken up for investigation.',
        payload: { from: 'under_review', to: 'in_progress' },
        visibility: 'public',
      })

      if (bucket === 'breached') {
        const breachOffsetDays = (dueAt.getTime() - createdAt.getTime()) / DAY_MS
        push(breachOffsetDays, {
          type: 'sla_breached',
          actorId: null,
          actorRole: null,
          remark: null,
          payload: { dueAt: dueAt.toISOString() },
          visibility: 'internal',
        })
      }

      if (bucket === 'resolved_closed' || bucket === 'appealed') {
        const resolveOffset = Math.max(2, Math.floor(sla * 0.8))
        advance('resolved')
        push(resolveOffset, {
          type: 'status_changed',
          actorId: officer.id,
          actorRole: 'redressal_officer',
          remark: 'Resolved: corrective action taken and confirmed with the complainant.',
          payload: { from: 'in_progress', to: 'resolved' },
          visibility: 'public',
        })
        resolvedAt = new Date(createdAt.getTime() + resolveOffset * DAY_MS)

        if (bucket === 'resolved_closed') {
          advance('closed')
          push(resolveOffset + 3, {
            type: 'status_changed',
            actorId: student.id,
            actorRole: 'student',
            remark: 'Resolution accepted.',
            payload: { from: 'resolved', to: 'closed' },
            visibility: 'public',
          })
          closedAt = new Date(createdAt.getTime() + (resolveOffset + 3) * DAY_MS)
          satisfactionRating = 4 + (i % 2)
        } else {
          advance('appealed')
          push(resolveOffset + 4, {
            type: 'appealed',
            actorId: student.id,
            actorRole: 'student',
            remark: 'Escalating to the Ombudsperson: the corrective action does not address the underlying issue.',
            payload: { from: 'resolved', to: 'appealed' },
            visibility: 'public',
          })
        }
      }
    }

    const [grievance] = await tx
      .insert(grievances)
      .values({
        institutionId,
        reference: `${seed.refPrefix}-${createdAt.getFullYear()}-${String(i + 1).padStart(5, '0')}`,
        submittedById: student.id,
        isAnonymous,
        categoryId: leaf.id,
        kind: 'grievance',
        subject: template.subject,
        body: template.body,
        status,
        assignedToId,
        dueAt,
        resolvedAt,
        closedAt,
        satisfactionRating,
        createdAt,
        updatedAt: drafts[drafts.length - 1]!.createdAt,
      })
      .returning()
    if (!grievance) throw new Error('failed to insert grievance')

    const chained = chainEvents(grievance.id, drafts)
    await tx.insert(grievanceEvents).values(
      chained.map((e) => ({
        institutionId,
        grievanceId: e.grievanceId,
        seq: e.seq,
        type: e.type,
        actorId: e.actorId,
        actorRole: e.actorRole,
        remark: e.remark,
        visibility: e.visibility,
        payload: e.payload,
        prevHash: e.prevHash,
        hash: e.hash,
        createdAt: e.createdAt,
      })),
    )
  }
}

// ---------------------------------------------------------------------------
// Announcements (Pillar 2) and handbook (Pillar 1)
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function seedAnnouncements(tx: Tx, institutionId: string, authorId: string, seed: InstitutionSeed): Promise<void> {
  const now = new Date()
  const items: Array<{ title: string; channel: string; isPinned: boolean; summary: string | null; daysAgo: number }> = [
    {
      title: 'Student Grievance Redressal Committee reconstituted for AY 2026-27',
      channel: 'administrative',
      isPinned: true,
      summary: 'Updated SGRC composition and the Ombudsperson contact are published on the disclosure page.',
      daysAgo: 10,
    },
    {
      title: 'Even-semester examination datesheet released',
      channel: 'academic',
      isPinned: false,
      summary: 'Check the exam cell portal for your branch schedule.',
      daysAgo: 6,
    },
    {
      title: 'Pre-placement talk: campus drive registrations open',
      channel: 'placement',
      isPinned: false,
      summary: 'Final-year students, register before the deadline.',
      daysAgo: 4,
    },
    {
      title: 'Inter-department sports meet begins next week',
      channel: 'sports',
      isPinned: false,
      summary: null,
      daysAgo: 2,
    },
    {
      title: 'Cultural fest volunteer registrations open',
      channel: 'society',
      isPinned: false,
      summary: null,
      daysAgo: 1,
    },
  ]

  for (const item of items) {
    await tx.insert(announcements).values({
      institutionId,
      authorId,
      title: item.title,
      slug: `${slugify(item.title)}-${seed.slug}`,
      summary: item.summary,
      body: `${item.summary ?? item.title}\n\nFor details, contact the relevant office.`,
      channel: item.channel,
      isPinned: item.isPinned,
      publishedAt: new Date(now.getTime() - item.daysAgo * DAY_MS),
    })
  }
}

async function seedHandbook(tx: Tx, institutionId: string, leaves: Leaf[]): Promise<void> {
  const byName = (n: string) => leaves.find((l) => l.name === n)?.id ?? null
  const now = new Date()

  const entries: Array<{
    question: string
    answer: string
    owningOffice: string
    categoryId: string | null
    reviewed: boolean
  }> = [
    {
      question: 'How do I apply for hostel room reallocation?',
      answer:
        'Submit the reallocation form to the Hostel Office within the first two weeks of a semester. Reallocation for medical reasons is processed within 48 hours.',
      owningOffice: 'Hostel Office',
      categoryId: byName('Room Allotment & Maintenance'),
      reviewed: true,
    },
    {
      question: 'What is the fee refund policy after withdrawal?',
      answer:
        'Refunds follow the UGC fee refund schedule: 100% before course commencement, tapering to 0% after week 6. Apply through the Accounts Office portal.',
      owningOffice: 'Accounts Office',
      categoryId: byName('Fees & Scholarship'),
      reviewed: true,
    },
    {
      question: 'How do I file a grievance anonymously?',
      answer:
        'Select "File anonymously" on the grievance form. Your identity is withheld from the committee UI but retained internally for audit, as required by the UGC regulations.',
      owningOffice: 'Dean of Student Welfare',
      categoryId: null,
      reviewed: true,
    },
    {
      question: 'Who do I contact for ragging or harassment concerns?',
      answer:
        'File under Ragging & Harassment, which routes to a redressal officer immediately and bypasses moderator triage. You may also contact the Anti-Ragging Cell helpline posted on the disclosure page.',
      owningOffice: 'Anti-Ragging Cell',
      categoryId: byName('Ragging & Harassment'),
      reviewed: true,
    },
    {
      question: 'How is the semester exam datesheet finalized?',
      answer:
        'The Examination Cell publishes a draft two weeks before the term ends; clashes reported within 48 hours are corrected before the final version.',
      owningOffice: 'Examination Cell',
      categoryId: byName('Exam Scheduling Conflict'),
      reviewed: false, // stale on purpose — the seed should show at least one entry due for review
    },
    {
      question: 'What is the process to appeal a grievance resolution?',
      answer:
        'A resolved or closed grievance can be appealed to the Ombudsperson within the institution\'s appeal window. Use the "Appeal" action on the grievance detail page.',
      owningOffice: 'Ombudsperson Office',
      categoryId: null,
      reviewed: true,
    },
  ]

  for (const e of entries) {
    await tx.insert(handbookEntries).values({
      institutionId,
      categoryId: e.categoryId,
      question: e.question,
      slug: slugify(e.question),
      answer: e.answer,
      owningOffice: e.owningOffice,
      reviewedAt: e.reviewed ? now : null,
      isPublished: true,
    })
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function ensureInstitution(seed: InstitutionSeed): Promise<{ id: string; justCreated: boolean }> {
  const existing = await withoutTenantScope('seed: look up institution by slug', (tx) =>
    tx.select({ id: institutions.id }).from(institutions).where(eq(institutions.slug, seed.slug)).limit(1),
  )
  if (existing[0]) return { id: existing[0].id, justCreated: false }

  const [row] = await withoutTenantScope('seed: create institution', (tx) =>
    tx
      .insert(institutions)
      .values({ slug: seed.slug, name: seed.name, slaResolutionDays: seed.slaResolutionDays })
      .returning(),
  )
  if (!row) throw new Error(`failed to insert institution ${seed.name}`)
  return { id: row.id, justCreated: true }
}

async function main() {
  console.log('Seeding SINC-P demo data...\n')

  const passwordHash = await hashPassword(DEV_PASSWORD)
  const institutionIds: string[] = []
  const credentials: Array<{ institution: string; role: string; email: string }> = []

  for (const seed of INSTITUTIONS) {
    const { id, justCreated } = await ensureInstitution(seed)
    institutionIds.push(id)

    if (justCreated) {
      await withTenant(id, async (tx) => {
        const leaves = await seedCategories(tx, id, seed.slaResolutionDays)
        const people = await seedUsers(tx, id, seed, passwordHash)
        await seedGrievances(tx, id, seed, leaves, people)
        await seedAnnouncements(tx, id, people.admin.id, seed)
        await seedHandbook(tx, id, leaves)
      })
      console.log(`- ${seed.name}: seeded.`)
    } else {
      console.log(`- ${seed.name}: already seeded, skipping.`)
    }

    await withTenant(id, async (tx) => {
      const rows = await tx.select({ email: users.email, role: users.role }).from(users)
      for (const r of rows) credentials.push({ institution: seed.name, role: r.role, email: r.email })
    })
  }

  console.log('\nVerifying grievance event chains and tenant scoping...')
  let totalGrievances = 0
  let totalEvents = 0

  for (const instId of institutionIds) {
    await withTenant(instId, async (tx) => {
      const rows = await tx.select().from(grievances)
      for (const g of rows) {
        if (g.institutionId !== instId) {
          throw new Error(`cross-tenant leak: grievance ${g.id} belongs to ${g.institutionId}, visible under ${instId}`)
        }
        const events = await tx
          .select()
          .from(grievanceEvents)
          .where(eq(grievanceEvents.grievanceId, g.id))
          .orderBy(grievanceEvents.seq)

        const verdict = verifyChain(events)
        if (!verdict.ok) {
          throw new Error(
            `hash chain broken for grievance ${g.reference} (institution ${instId}) at seq ${verdict.brokenAtSeq}: ${verdict.reason}`,
          )
        }
        totalGrievances++
        totalEvents += events.length
      }
    })
  }
  console.log(`  ${totalGrievances} grievances, ${totalEvents} events, all chains verified, all rows correctly tenant-scoped.`)

  if (institutionIds.length >= 2) {
    const [a, b] = institutionIds as [string, string]
    const [other] = await withTenant(b, (tx) =>
      tx.select({ id: grievances.id, reference: grievances.reference }).from(grievances).limit(1),
    )
    if (other) {
      const leaked = await withTenant(a, (tx) => tx.select().from(grievances).where(eq(grievances.id, other.id)))
      if (leaked.length > 0) {
        throw new Error("RLS FAILED: institution A read institution B's grievance by id")
      }
      console.log(`  Cross-tenant probe: institution A queried institution B's grievance ${other.reference} by id, got zero rows. RLS holds.`)
    }
  }

  console.log(`\nDev login — password for every seeded user: ${DEV_PASSWORD}\n`)
  for (const c of credentials) {
    console.log(`  [${c.institution}] ${c.role.padEnd(18)} ${c.email}`)
  }

  await pool.end()
}

main().catch(async (err) => {
  console.error('\nSeed failed:', err)
  await pool.end()
  process.exitCode = 1
})
