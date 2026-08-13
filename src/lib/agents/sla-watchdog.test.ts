import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { dbAvailable } from '@/test/db'
import { pool, withTenant, withoutTenantScope } from '@/db/client'
import {
  categories,
  grievanceEvents,
  grievances,
  institutions,
  notifications,
  users,
} from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { verifyChain } from '@/lib/grievance/audit'
import { sweepInstitution, AGENT_NAME } from './sla-watchdog'

const SLUG = `watchdog-${Date.now()}`
const DAY = 86_400_000

describe.skipIf(!dbAvailable)('the SLA watchdog', () => {
  let instId = ''
  let officerId = ''
  let studentId = ''
  let categoryId = ''
  let overdueId = ''
  let onTrackId = ''
  let closedOverdueId = ''

  beforeAll(async () => {
    const hash = await hashPassword('watchdog-test-password')
    await withoutTenantScope('test fixture', async (tx) => {
      const [inst] = await tx
        .insert(institutions)
        .values({ slug: SLUG, name: 'Watchdog College' })
        .returning()
      instId = inst!.id

      const mk = async (role: 'student' | 'redressal_officer' | 'institution_admin' | 'ombudsperson', local: string) => {
        const [u] = await tx
          .insert(users)
          .values({
            institutionId: instId,
            email: `${local}@${SLUG}.test`,
            fullName: local,
            role,
            passwordHash: hash,
          })
          .returning()
        return u!.id
      }
      studentId = await mk('student', 'student')
      officerId = await mk('redressal_officer', 'officer')
      await mk('institution_admin', 'registrar')
      await mk('ombudsperson', 'ombudsperson')

      const [c] = await tx
        .insert(categories)
        .values({ institutionId: instId, name: 'Hostel' })
        .returning()
      categoryId = c!.id

      const now = Date.now()
      const mkG = async (ref: string, dueOffsetDays: number, status: 'in_progress' | 'closed') => {
        const [g] = await tx
          .insert(grievances)
          .values({
            institutionId: instId,
            reference: ref,
            submittedById: studentId,
            categoryId,
            subject: `Case ${ref}`,
            body: 'Body text.',
            status,
            assignedToId: officerId,
            dueAt: new Date(now + dueOffsetDays * DAY),
            createdAt: new Date(now - 20 * DAY),
          })
          .returning()
        return g!.id
      }
      overdueId = await mkG('WD-1', -5, 'in_progress')
      onTrackId = await mkG('WD-2', +5, 'in_progress')
      // Terminal: the clock stopped, so a breach is not possible however old it is.
      closedOverdueId = await mkG('WD-3', -30, 'closed')
    })
  })

  afterAll(async () => {
    await withoutTenantScope('test teardown', (tx) =>
      tx.delete(institutions).where(eq(institutions.id, instId)),
    )
    await pool.end()
  })

  const eventsFor = (id: string) =>
    withTenant(instId, (tx) =>
      tx
        .select()
        .from(grievanceEvents)
        .where(eq(grievanceEvents.grievanceId, id))
        .orderBy(grievanceEvents.seq),
    )

  it('escalates only what has actually breached', async () => {
    const report = await sweepInstitution(instId)
    expect(report.breached).toBe(1)
    expect(report.escalated).toBe(1)

    expect((await eventsFor(overdueId)).some((e) => e.type === 'sla_breached')).toBe(true)
    expect((await eventsFor(onTrackId))).toHaveLength(0)
    // A closed case is out of scope no matter how far past its date it sits.
    expect((await eventsFor(closedOverdueId))).toHaveLength(0)
  })

  it('attributes the action to no human', async () => {
    const [event] = (await eventsFor(overdueId)).filter((e) => e.type === 'sla_breached')
    // Putting a person's name on something nobody decided would be a false entry in an
    // audit trail whose whole value is that it is not false.
    expect(event!.actorId).toBeNull()
    expect(event!.actorRole).toBeNull()
    expect((event!.payload as Record<string, unknown>).agent).toBe(AGENT_NAME)
  })

  it('writes a link the chain still verifies', async () => {
    const events = await eventsFor(overdueId)
    expect(verifyChain(events)).toMatchObject({ ok: true })
  })

  it('notifies the officer and the tier above them', async () => {
    const queued = await withTenant(instId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.grievanceId, overdueId), eq(notifications.kind, 'sla_breached')),
        ),
    )
    const recipients = queued.map((q) => q.recipientEmail)
    expect(recipients).toContain(`officer@${SLUG}.test`)
    expect(recipients).toContain(`registrar@${SLUG}.test`)
    expect(recipients).toContain(`ombudsperson@${SLUG}.test`)
    // The student is not told their case is late by a robot before a human has looked.
    expect(recipients).not.toContain(`student@${SLUG}.test`)
  })

  it('is idempotent: a second sweep escalates nothing again', async () => {
    const before = (await eventsFor(overdueId)).length
    const report = await sweepInstitution(instId)

    expect(report.breached).toBe(1)
    expect(report.escalated).toBe(0)
    expect(report.alreadyHandled).toBe(1)
    // A cron firing hourly must not append twenty-four identical events.
    expect((await eventsFor(overdueId)).length).toBe(before)
  })

  it('does not send a duplicate warning on the same day', async () => {
    const queued = await withTenant(instId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.grievanceId, overdueId), eq(notifications.kind, 'sla_breached')),
        ),
    )
    // Three recipients, one message each, after two sweeps.
    expect(queued).toHaveLength(3)
  })

  it('never changes a status', async () => {
    // The agent's authority is escalate, notify, record. If it could move a case to
    // resolved it would become the fastest route to a clean compliance report, which is
    // the exact fraud this product exists to make hard.
    const [g] = await withTenant(instId, (tx) =>
      tx.select().from(grievances).where(eq(grievances.id, overdueId)),
    )
    expect(g!.status).toBe('in_progress')
    expect(g!.resolvedAt).toBeNull()
    expect(g!.closedAt).toBeNull()
  })

  it('stays inside its own institution', async () => {
    // Other institutions legitimately have their own breach events, from their own
    // sweeps. What must hold is that sweeping THIS one changes none of theirs, so the
    // assertion is on the delta rather than on the absolute state of the database.
    const countElsewhere = async () => {
      const all = await withoutTenantScope('cross-tenant check', (tx) =>
        tx.select().from(grievanceEvents).where(eq(grievanceEvents.type, 'sla_breached')),
      )
      return all.filter((e) => e.institutionId !== instId).length
    }

    const before = await countElsewhere()
    await sweepInstitution(instId)
    expect(await countElsewhere()).toBe(before)

    const mine = await withoutTenantScope('cross-tenant check', (tx) =>
      tx.select().from(grievanceEvents).where(eq(grievanceEvents.type, 'sla_breached')),
    )
    expect(mine.filter((e) => e.institutionId === instId)).toHaveLength(1)
  })
})
