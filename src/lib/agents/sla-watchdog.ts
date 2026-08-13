/**
 * The SLA watchdog: the one part of this system that acts without being asked.
 *
 * It runs on a timer, finds grievances that have passed or are about to pass their
 * statutory deadline, escalates them up the UGC ladder, queues the notifications, and
 * writes an audit event for every action it takes.
 *
 * ## What it is allowed to do
 *
 * Escalate, notify, and record. That is the whole list.
 *
 * It cannot close a grievance, change a status a human owns, decide an outcome, or write
 * anything a student reads as a decision. An automated agent that could resolve cases
 * would quietly become the fastest route to a clean compliance report, and a clean report
 * that nobody earned is precisely the fraud this product exists to make difficult.
 *
 * ## Why every action is an event
 *
 * "The system escalated it automatically" has to be as auditable as "the Registrar
 * escalated it", or the trail has a hole in it exactly where the awkward questions land.
 * Each action appends to the same hash chain a human action would, with `actorId` null
 * and a payload naming the agent and its run.
 *
 * ## Idempotency
 *
 * Runs are at-least-once, and a cron that fires twice must not send two breach warnings.
 * Every notification carries a dedupe key built from the grievance and the day, and every
 * escalation checks for its own prior event before writing another.
 */
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { withTenant, withoutTenantScope, type Tx } from '@/db/client'
import { grievanceEvents, grievances, institutions, users, type Grievance } from '@/db/schema'
import { TERMINAL_STATUSES } from '@/lib/grievance/policy'
import { daysOverdue, slaState } from '@/lib/grievance/sla'
import { appendEvent } from '@/lib/grievance/_internal'
import { enqueue } from '@/lib/notify/outbox'
import * as tpl from '@/lib/notify/templates'

export const AGENT_NAME = 'sla-watchdog'

export interface WatchdogReport {
  institutionId: string
  scanned: number
  breached: number
  escalated: number
  notified: number
  alreadyHandled: number
}

/** A deterministic id for one sweep, so every event it writes can be traced together. */
function runId(now: Date): string {
  return `${AGENT_NAME}:${now.toISOString().slice(0, 10)}`
}

/**
 * Sweep one institution.
 *
 * Tenant-scoped like everything else: the agent is not exempt from RLS, and running it
 * per institution rather than across all of them means a bug cannot escalate one
 * college's grievance into another's queue.
 */
export async function sweepInstitution(institutionId: string, now = new Date()): Promise<WatchdogReport> {
  const report: WatchdogReport = {
    institutionId,
    scanned: 0,
    breached: 0,
    escalated: 0,
    notified: 0,
    alreadyHandled: 0,
  }

  return withTenant(institutionId, async (tx) => {
    const [institution] = await tx
      .select()
      .from(institutions)
      .where(eq(institutions.id, institutionId))
      .limit(1)
    if (!institution) return report

    const open = await tx
      .select()
      .from(grievances)
      .where(
        and(
          eq(grievances.institutionId, institutionId),
          isNotNull(grievances.dueAt),
          // Terminal cases have no clock left to breach.
          sql`${grievances.status} NOT IN ${TERMINAL_STATUSES}`,
          lt(grievances.dueAt, now),
        ),
      )

    report.scanned = open.length
    if (open.length === 0) return report

    // One query for every prior breach event rather than one per grievance: a sweep over
    // a few hundred overdue cases should not be a few hundred round trips.
    const priorBreaches = await tx
      .select({ grievanceId: grievanceEvents.grievanceId })
      .from(grievanceEvents)
      .where(
        and(
          eq(grievanceEvents.institutionId, institutionId),
          eq(grievanceEvents.type, 'sla_breached'),
          inArray(
            grievanceEvents.grievanceId,
            open.map((g) => g.id),
          ),
        ),
      )
    const alreadyFlagged = new Set(priorBreaches.map((r) => r.grievanceId))

    const officers = await tx
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.institutionId, institutionId), eq(users.isActive, true)))

    const byId = new Map(officers.map((o) => [o.id, o]))
    const escalationTargets = officers.filter(
      (o) => o.role === 'institution_admin' || o.role === 'ombudsperson',
    )

    for (const grievance of open) {
      if (slaState(grievance, now) !== 'breached') continue
      report.breached += 1

      if (alreadyFlagged.has(grievance.id)) {
        report.alreadyHandled += 1
        continue
      }

      const overdue = grievance.dueAt ? daysOverdue(grievance.dueAt, now) : 0

      await appendEvent(tx, institutionId, grievance.id, {
        type: 'sla_breached',
        // No actor: this was nobody's decision, and attributing it to a person would put
        // a false name in an audit trail.
        actorId: null,
        actorRole: null,
        remark: `Statutory deadline passed ${overdue} day${overdue === 1 ? '' : 's'} ago. Escalated automatically.`,
        payload: {
          agent: AGENT_NAME,
          run: runId(now),
          daysOverdue: overdue,
          dueAt: grievance.dueAt?.toISOString() ?? null,
        },
        visibility: 'public',
      })
      report.escalated += 1

      report.notified += await notifyBreach(tx, {
        institutionId,
        institutionName: institution.name,
        grievance,
        overdue,
        assignee: grievance.assignedToId ? byId.get(grievance.assignedToId) : undefined,
        escalationTargets,
        now,
      })
    }

    return report
  })
}

async function notifyBreach(
  tx: Tx,
  args: {
    institutionId: string
    institutionName: string
    grievance: Grievance
    overdue: number
    assignee?: { id: string; email: string }
    escalationTargets: Array<{ id: string; email: string }>
    now: Date
  },
): Promise<number> {
  const rendered = tpl.slaBreached(args.grievance, { name: args.institutionName }, args.overdue)

  // The assigned officer first, then the tier above them. The UGC ladder is officer,
  // then institution admin, then Ombudsperson, and a breach concerns all of them.
  const recipients = [
    ...(args.assignee ? [args.assignee] : []),
    ...args.escalationTargets,
  ]

  let sent = 0
  for (const person of recipients) {
    await enqueue(tx, {
      institutionId: args.institutionId,
      recipientUserId: person.id,
      recipientEmail: person.email,
      kind: 'sla_breached',
      grievanceId: args.grievance.id,
      subject: rendered.subject,
      body: rendered.body,
      // Per grievance, per person, per day. A cron that fires hourly sends one warning,
      // not twenty-four.
      dedupeKey: tpl.dedupeKeyFor(
        'sla_breached',
        args.grievance.id,
        `${person.id}:${args.now.toISOString().slice(0, 10)}`,
      ),
    })
    sent += 1
  }
  return sent
}

/**
 * Sweep every institution.
 *
 * Cross-tenant by necessity: the agent is a platform job with no request behind it. It
 * looks up the tenant list once and then does all real work inside `withTenant`, so the
 * privileged connection never touches a grievance.
 */
export async function sweepAll(now = new Date()): Promise<WatchdogReport[]> {
  const tenants = await withoutTenantScope('the watchdog is a platform job', (tx) =>
    tx.select({ id: institutions.id }).from(institutions),
  )

  const reports: WatchdogReport[] = []
  for (const tenant of tenants) {
    // Sequential and independently guarded: one institution with bad data must not stop
    // the sweep for every other institution.
    try {
      reports.push(await sweepInstitution(tenant.id, now))
    } catch (err) {
      console.error(
        `[${AGENT_NAME}] institution ${tenant.id} failed:`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return reports
}
