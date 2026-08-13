import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CsrfField } from '@/components/CsrfField'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SlaBadge } from '@/components/ui/SlaBadge'
import { StatusPill } from '@/components/ui/StatusPill'
import { allowedTransitions, canAssign, canSetStatus, isOpen } from '@/lib/grievance/policy'
import { getGrievanceDetail, listAssignableStaff, type GrievanceDetail } from '@/lib/grievance/service'
import { requireStaffActor } from '../../../_lib/actor'
import { ROLE_LABELS } from '../../../_lib/role-labels'
import { STATUS_LABELS } from '../../../_lib/status-labels'
import { addRemarkAction, assignAction, transitionAction } from './actions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CaseViewPage({ params }: PageProps) {
  const actor = await requireStaffActor()
  const { id } = await params

  const [detail, assignableStaff] = await Promise.all([getGrievanceDetail(actor, id), listAssignableStaff(actor)])
  if (!detail) notFound()

  const { grievance } = detail
  const transitions = allowedTransitions(grievance.status).filter((to) => canSetStatus(actor, grievance, to).ok)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/staff" className="text-sm text-accent hover:underline">
        ← Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-fg-muted">{grievance.reference}</p>
          <h1 className="text-lg font-semibold text-fg">{grievance.subject}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={grievance.status} />
          <SlaBadge grievance={grievance} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader className="text-sm font-medium text-fg">Case details</CardHeader>
            <CardBody className="flex flex-col gap-3">
              <p className="whitespace-pre-wrap text-sm text-fg">{grievance.body}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Detail label="Category" value={detail.categoryName ?? 'Uncategorised'} />
                <Detail label="Filed by" value={grievance.isAnonymous ? 'Withheld (anonymous)' : (detail.submittedByName ?? '—')} />
                <Detail label="Assigned to" value={detail.assignedToName ?? 'Unassigned'} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="text-sm font-medium text-fg">Trail</CardHeader>
            <CardBody>
              <Timeline events={detail.events} />
            </CardBody>
          </Card>

          {detail.attachments.length > 0 && (
            <Card>
              <CardHeader className="text-sm font-medium text-fg">Attachments</CardHeader>
              <CardBody className="flex flex-col gap-2">
                {detail.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    {a.fileName}
                  </a>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="text-sm font-medium text-fg">Action panel</CardHeader>
            <CardBody className="flex flex-col gap-4">
              {transitions.length === 0 && !canAssign(actor, grievance) && (
                <p className="text-xs text-fg-muted">No actions available on this grievance for your role.</p>
              )}

              {/* Only transitions canSetStatus already permits for this actor render here —
                  the server would reject anything else, so nothing else is offered. */}
              {transitions.map((to) => (
                <form key={to} action={transitionAction.bind(null, grievance.id, to)} className="flex flex-col gap-2">
                  <CsrfField />
                  <span className="text-xs font-medium text-fg-muted">Move to {STATUS_LABELS[to]}</span>
                  <textarea
                    name="remark"
                    rows={2}
                    placeholder="Optional remark, visible to the student"
                    className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-fg-muted"
                  />
                  <button type="submit" className={buttonClasses('primary', 'sm')}>
                    Move to {STATUS_LABELS[to]}
                  </button>
                </form>
              ))}

              {canAssign(actor, grievance) && (
                <form action={assignAction.bind(null, grievance.id)} className="flex flex-col gap-2 border-t border-border pt-4">
                <CsrfField />
                  <span className="text-xs font-medium text-fg-muted">Reassign</span>
                  <select
                    name="assigneeId"
                    required
                    defaultValue=""
                    className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
                  >
                    <option value="" disabled>
                      Choose an officer…
                    </option>
                    {assignableStaff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={buttonClasses('secondary', 'sm')}>
                    Assign
                  </button>
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="text-sm font-medium text-fg">Add a remark</CardHeader>
            <CardBody>
              <form action={addRemarkAction.bind(null, grievance.id)} className="flex flex-col gap-2">
                <CsrfField />
                <textarea
                  name="remark"
                  required
                  rows={3}
                  placeholder="Note for the file…"
                  className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg placeholder:text-fg-muted"
                />
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" name="visibility" value="internal" />
                  Internal only — the student will never see this
                </label>
                <button type="submit" className={buttonClasses('secondary', 'sm')}>
                  Add remark
                </button>
              </form>
            </CardBody>
          </Card>

          <Alert variant="info" title="Tamper-evident, not tamper-proof">
            Every entry below is hash-chained. Editing history isn't offered because
            there's no code path that does it — corrections are new entries, not edits.
          </Alert>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  )
}

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Filed',
  assigned: 'Assigned',
  status_changed: 'Status changed',
  remark_added: 'Remark',
  attachment_added: 'Attachment added',
  escalated: 'Escalated',
  appealed: 'Appealed',
  reopened: 'Reopened',
  sla_breached: 'SLA breached',
  withdrawn: 'Withdrawn',
}

function eventSummary(event: GrievanceDetail['events'][number]): string | null {
  const payload = event.payload
  if (event.type === 'status_changed' && payload && 'from' in payload && 'to' in payload) {
    const from = String(payload.from)
    const to = String(payload.to)
    return `${STATUS_LABELS[from as keyof typeof STATUS_LABELS] ?? from} → ${STATUS_LABELS[to as keyof typeof STATUS_LABELS] ?? to}`
  }
  if (event.type === 'attachment_added' && payload && 'fileName' in payload) {
    return String(payload.fileName)
  }
  return null
}

/**
 * The hash-chained trail, rendered oldest-first (the order it was written and verified
 * in). Internal remarks get their own visual treatment — a distinct badge and a tinted
 * left border — so a staff member skimming this can never mistake one for something the
 * student will read.
 */
function Timeline({ events }: { events: GrievanceDetail['events'] }) {
  if (events.length === 0) return <p className="text-xs text-fg-muted">No events yet.</p>

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => {
        const isInternal = event.visibility === 'internal'
        const summary = eventSummary(event)
        return (
          <li
            key={event.id}
            className="border-l-2 border-border pl-4"
            style={isInternal ? { borderColor: 'var(--color-status-escalate-border)' } : undefined}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-fg">{EVENT_LABELS[event.type] ?? event.type}</span>
              {isInternal && <Badge variant="escalate">Internal — staff only</Badge>}
              <span className="text-fg-muted">
                {event.actorName ?? (event.actorRole ? ROLE_LABELS[event.actorRole] : 'System')}
              </span>
              <span className="text-fg-muted">{new Date(event.createdAt).toLocaleString('en-IN')}</span>
            </div>
            {summary && <p className="mt-1 text-sm text-fg-muted">{summary}</p>}
            {event.remark && <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{event.remark}</p>}
          </li>
        )
      })}
    </ol>
  )
}
