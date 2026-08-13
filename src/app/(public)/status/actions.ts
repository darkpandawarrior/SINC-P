'use server'

/**
 * Public status lookup. No session — the reference number plus the email used to file
 * is the proof of ownership instead, the same shape as tracking a parcel by order
 * number and postcode. That means this deliberately does NOT go through canView/policy
 * (there is no Actor; nobody is signed in) — possession of both secrets together is the
 * authorisation check here, not a role.
 *
 * A wrong reference and a right-reference-wrong-email both return the same
 * `not_found` state. Telling them apart would let an attacker confirm a reference
 * number is real by trying candidate emails against it.
 */
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db/client'
import { grievanceEvents, grievances, users } from '@/db/schema'
import { clientIp } from '@/lib/auth/request-meta'
import type { Status } from '@/lib/grievance/policy'
import { getPublicInstitution } from '@/lib/stats'

// ponytail: in-memory limiter, same single-instance ceiling as src/lib/auth/ratelimit.ts
// — a second `app` container would let an attacker double this budget by round-robining.
// Not shared with auth/ratelimit.ts's buckets on purpose: those are keyed for
// login/reset semantics, and reusing that module's exported functions here would mix an
// unrelated flow into their account-lockout accounting.
interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()
const WINDOW_MS = 15 * 60 * 1000

function hit(key: string, limit: number): boolean {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (existing.count >= limit) return false
  existing.count += 1
  return true
}

function checkStatusLookupRateLimit(ip: string, email: string): boolean {
  const ipOk = hit(`status:ip:${ip}`, 30)
  const acctOk = hit(`status:acct:${email.toLowerCase()}`, 10)
  return ipOk && acctOk
}

const lookupSchema = z.object({
  reference: z.string().trim().min(3).max(32),
  email: z.string().trim().toLowerCase().email().max(255),
})

export interface StatusLookupEvent {
  type: string
  remark: string | null
  createdAt: string
}

export interface StatusLookupResult {
  reference: string
  subject: string
  status: Status
  submittedAt: string
  dueAt: string | null
  resolvedAt: string | null
  events: StatusLookupEvent[]
}

export type StatusLookupState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | { status: 'rate_limited' }
  | { status: 'found'; result: StatusLookupResult }

export async function lookupGrievanceStatus(
  _prev: StatusLookupState,
  formData: FormData,
): Promise<StatusLookupState> {
  const parsed = lookupSchema.safeParse({
    reference: formData.get('reference'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { status: 'error', message: 'Enter a valid reference number and the email used to file.' }
  }
  const { reference, email } = parsed.data

  const ip = await clientIp()
  if (!checkStatusLookupRateLimit(ip, email)) {
    return { status: 'rate_limited' }
  }

  const institution = await getPublicInstitution()
  if (!institution) return { status: 'not_found' }

  const found = await withTenant(institution.id, async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.institutionId, institution.id), eq(users.email, email)))
      .limit(1)
    if (!user) return null

    const [grievance] = await tx
      .select()
      .from(grievances)
      .where(
        and(
          eq(grievances.institutionId, institution.id),
          eq(grievances.reference, reference.toUpperCase()),
          eq(grievances.submittedById, user.id),
        ),
      )
      .limit(1)
    if (!grievance) return null

    // Internal-visibility events (routing rationale, screening notes) never reach an
    // unauthenticated caller — the same rule canViewInternalRemarks enforces for staff.
    const events = await tx
      .select({ type: grievanceEvents.type, remark: grievanceEvents.remark, createdAt: grievanceEvents.createdAt })
      .from(grievanceEvents)
      .where(and(eq(grievanceEvents.grievanceId, grievance.id), eq(grievanceEvents.visibility, 'public')))
      .orderBy(asc(grievanceEvents.seq))

    return { grievance, events }
  })

  if (!found) return { status: 'not_found' }

  return {
    status: 'found',
    result: {
      reference: found.grievance.reference,
      subject: found.grievance.subject,
      status: found.grievance.status,
      submittedAt: found.grievance.createdAt.toISOString(),
      dueAt: found.grievance.dueAt?.toISOString() ?? null,
      resolvedAt: found.grievance.resolvedAt?.toISOString() ?? null,
      events: found.events.map((e) => ({
        type: e.type,
        remark: e.remark,
        createdAt: e.createdAt.toISOString(),
      })),
    },
  }
}
