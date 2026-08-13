import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { SlaBadge } from '@/components/ui/SlaBadge'
import { StatusPill } from '@/components/ui/StatusPill'
import { cn } from '@/lib/cn'
import { allowedTransitions, isOpen } from '@/lib/grievance/policy'
import { getGrievanceByReference, getGrievanceDetail, getGrievanceForActor, getInstitution } from '@/lib/grievance/service'
import { computeDueAt, daysOverdue, daysRemaining } from '@/lib/grievance/sla'
import { requireStudentActor } from '../../_lib/actor'
import { CsrfField } from '@/components/CsrfField'
import { eventActorLabel, eventDescription, formatDate, formatDateTime, NEXT_STEP_COPY } from '../../_lib/status-copy'
import { appealAction, closeAction, withdrawAction } from './actions'

export default async function GrievanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ filed?: string; error?: string; attachmentError?: string }>
}) {
  const { actor } = await requireStudentActor()
  const { reference } = await params
  const { filed, error, attachmentError } = await searchParams

  const grievance = await getGrievanceByReference(actor, reference)
  if (!grievance) notFound()

  const [detail, institution] = await Promise.all([getGrievanceDetail(actor, grievance.id), getInstitution(actor)])
  if (!detail) notFound()

  const now = new Date()
  const open = isOpen(grievance.status)
  const transitions = allowedTransitions(grievance.status)

  // The appeal window is a separate statutory clock from the resolution SLA, anchored
  // on when the grievance was resolved (or, failing that, closed) — not on when it was
  // filed. canSetStatus doesn't enforce this window itself (see policy.ts), so this is
  // advisory: it shapes what the page shows, the server would still accept a POST after
  // this date. Tighten canSetStatus's TRANSITIONS if that gap needs to be load-bearing.
  const appealAnchor = grievance.resolvedAt ?? grievance.closedAt
  const appealDeadline =
    appealAnchor && institution ? computeDueAt(appealAnchor, { institutionSlaDays: institution.slaAppealWindowDays }) : null
  const appealWindowOpen = !appealDeadline || now.getTime() <= appealDeadline.getTime()

  let appealChildReference: string | null = null
  if (grievance.status === 'appealed') {
    const appealedEvent = detail.events.find((e) => e.type === 'appealed')
    const childId = (appealedEvent?.payload as { appealGrievanceId?: string } | null)?.appealGrievanceId
    if (childId) {
      const child = await getGrievanceForActor(actor, childId)
      appealChildReference = child?.reference ?? null
    }
  }

  let originalReference: string | null = null
  if (grievance.appealOfId) {
    const original = await getGrievanceForActor(actor, grievance.appealOfId)
    originalReference = original?.reference ?? null
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {filed === '1' && (
        <Alert variant="success" title="Grievance filed">
          Your reference number is <span className="font-mono font-semibold">{grievance.reference}</span>. Save it
          — you&apos;ll need it to check on this grievance.
        </Alert>
      )}
      {attachmentError && (
        <Alert variant="warning" title="Some attachments could not be added">
          {attachmentError}
        </Alert>
      )}
      {error && <Alert variant="danger" title={error} />}

      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-sm text-fg-muted">{grievance.reference}</span>
            <div className="flex items-center gap-2">
              <StatusPill status={grievance.status} />
              <SlaBadge grievance={grievance} />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-fg">{grievance.subject}</h1>
          {detail.categoryName && <p className="text-sm text-fg-muted">{detail.categoryName}</p>}
          <p className="whitespace-pre-wrap text-sm text-fg">{grievance.body}</p>
          <p className="text-sm text-fg-muted">{NEXT_STEP_COPY[grievance.status]}</p>

          {grievance.dueAt && open && <DueAtNote dueAt={grievance.dueAt} now={now} />}

          {originalReference && (
            <p className="text-sm text-fg-muted">
              This is an appeal of{' '}
              <Link className="text-accent hover:underline" href={`/my/${originalReference}`}>
                {originalReference}
              </Link>
              .
            </p>
          )}
          {appealChildReference && (
            <p className="text-sm text-fg-muted">
              Your appeal:{' '}
              <Link className="text-accent hover:underline" href={`/my/${appealChildReference}`}>
                {appealChildReference}
              </Link>
            </p>
          )}
        </CardBody>
      </Card>

      {detail.attachments.length > 0 && (
        <Card>
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-fg">Attachments</h2>
            <ul className="flex flex-col gap-1">
              {detail.attachments.map((a) => (
                <li key={a.id}>
                  <a href={`/api/attachments/${a.id}`} className="text-sm text-accent hover:underline">
                    {a.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-fg">Trail</h2>
          <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
            {detail.events.map((e) => (
              <li key={e.id}>
                <p className="text-sm font-medium text-fg">{eventDescription(e)}</p>
                {e.remark && <p className="text-sm text-fg-muted">{e.remark}</p>}
                <p className="text-xs text-fg-muted">
                  {eventActorLabel(e, actor.id)} &middot; {formatDateTime(e.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {(transitions.includes('closed') || transitions.includes('withdrawn') || transitions.includes('appealed')) && (
        <Card>
          <CardBody className="flex flex-col gap-6">
            <h2 className="text-sm font-semibold text-fg">Actions</h2>
            {transitions.includes('closed') && <AcceptForm grievanceId={grievance.id} reference={grievance.reference} />}
            {transitions.includes('appealed') && (
              <AppealForm
                grievanceId={grievance.id}
                reference={grievance.reference}
                appealDeadline={appealDeadline}
                windowOpen={appealWindowOpen}
              />
            )}
            {transitions.includes('withdrawn') && <WithdrawForm grievanceId={grievance.id} reference={grievance.reference} />}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function DueAtNote({ dueAt, now }: { dueAt: Date; now: Date }) {
  const remaining = daysRemaining(dueAt, now)
  const overdue = remaining < 0
  const text = overdue
    ? `Statutory deadline: ${formatDate(dueAt)} — ${daysOverdue(dueAt, now)} day${daysOverdue(dueAt, now) === 1 ? '' : 's'} overdue.`
    : `Statutory deadline: ${formatDate(dueAt)} (${remaining} day${remaining === 1 ? '' : 's'} remaining).`
  return <p className={cn('text-sm font-medium', overdue ? 'text-status-danger-fg' : 'text-fg-muted')}>{text}</p>
}

function AcceptForm({ grievanceId, reference }: { grievanceId: string; reference: string }) {
  return (
    <form action={closeAction} className="flex flex-col gap-3">
      <CsrfField />
      <input type="hidden" name="grievanceId" value={grievanceId} />
      <input type="hidden" name="reference" value={reference} />
      <div>
        <p className="text-sm font-medium text-fg">Accept this resolution</p>
        <p className="text-sm text-fg-muted">
          Closing ends the statutory clock. You can still appeal within the appeal window after closing.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="satisfactionRating" className="text-sm text-fg">
          How satisfied were you with this resolution? (optional)
        </label>
        <select
          id="satisfactionRating"
          name="satisfactionRating"
          className="w-fit rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
        >
          <option value="">Prefer not to say</option>
          <option value="5">5 — Very satisfied</option>
          <option value="4">4 — Satisfied</option>
          <option value="3">3 — Neutral</option>
          <option value="2">2 — Dissatisfied</option>
          <option value="1">1 — Very dissatisfied</option>
        </select>
      </div>
      <Button type="submit" size="sm" className="w-fit">
        Accept resolution
      </Button>
    </form>
  )
}

function WithdrawForm({ grievanceId, reference }: { grievanceId: string; reference: string }) {
  return (
    <form action={withdrawAction} className="flex flex-col gap-3 border-t border-border pt-4">
      <CsrfField />
      <input type="hidden" name="grievanceId" value={grievanceId} />
      <input type="hidden" name="reference" value={reference} />
      <div>
        <p className="text-sm font-medium text-fg">Withdraw this grievance</p>
        <p className="text-sm text-fg-muted">This ends it permanently. There is no undo.</p>
      </div>
      <textarea
        name="remark"
        rows={2}
        placeholder="Reason (optional)"
        className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
      />
      <Button type="submit" variant="danger" size="sm" className="w-fit">
        Withdraw
      </Button>
    </form>
  )
}

function AppealForm({
  grievanceId,
  reference,
  appealDeadline,
  windowOpen,
}: {
  grievanceId: string
  reference: string
  appealDeadline: Date | null
  windowOpen: boolean
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium text-fg">Appeal to the Ombudsperson</p>
        {appealDeadline && (
          <p className={cn('text-sm', windowOpen ? 'text-fg-muted' : 'text-status-danger-fg')}>
            {windowOpen
              ? `You can appeal until ${formatDate(appealDeadline)}.`
              : `The appeal window closed on ${formatDate(appealDeadline)}.`}
          </p>
        )}
      </div>
      {windowOpen && (
        <form action={appealAction} className="flex flex-col gap-3">
          <CsrfField />
          <input type="hidden" name="grievanceId" value={grievanceId} />
          <input type="hidden" name="reference" value={reference} />
          <textarea
            name="body"
            required
            minLength={10}
            maxLength={8000}
            rows={4}
            placeholder="Why are you appealing this decision?"
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
          <Button type="submit" variant="secondary" size="sm" className="w-fit">
            File appeal
          </Button>
        </form>
      )}
    </div>
  )
}
