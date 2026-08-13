'use client'

import { useActionState } from 'react'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Card, CardBody } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { SlaBadge } from '@/components/ui/SlaBadge'
import { isOpen } from '@/lib/grievance/policy'
import { lookupGrievanceStatus, type StatusLookupResult, type StatusLookupState } from './actions'

const initialState: StatusLookupState = { status: 'idle' }

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Filed',
  status_changed: 'Status updated',
  remark_added: 'Remark added',
  attachment_added: 'Attachment added',
  escalated: 'Escalated',
  appealed: 'Appealed',
  reopened: 'Reopened',
  withdrawn: 'Withdrawn',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function StatusLookupForm() {
  const [state, formAction, pending] = useActionState(lookupGrievanceStatus, initialState)

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field id="reference" name="reference" label="Reference number" placeholder="e.g. RITB-2026-00042" required />
        </div>
        <div className="flex-1">
          <Field id="email" name="email" type="email" label="Email used to file" required />
        </div>
        <Button type="submit" disabled={pending} className="sm:mb-0.5">
          {pending ? 'Checking…' : 'Check status'}
        </Button>
      </form>

      {state.status === 'error' && (
        <Alert variant="danger" title="Check your input">
          {state.message}
        </Alert>
      )}
      {state.status === 'rate_limited' && (
        <Alert variant="warning" title="Too many attempts">
          Wait a few minutes before trying again.
        </Alert>
      )}
      {state.status === 'not_found' && (
        <Alert variant="info" title="No match found">
          No grievance matches that reference number and email together. Double-check both are
          exactly as used when filing.
        </Alert>
      )}
      {state.status === 'found' && <StatusResult {...state.result} />}
    </div>
  )
}

function StatusResult({ reference, subject, status, submittedAt, dueAt, resolvedAt, events }: StatusLookupResult) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{reference}</p>
            <p className="font-medium text-fg">{subject}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <SlaBadge
              // The action serialises dates to strings for the client boundary, so
              // rehydrate them. `submittedAt` is this view's name for createdAt.
              grievance={{
                status,
                dueAt: dueAt ? new Date(dueAt) : null,
                resolvedAt: resolvedAt ? new Date(resolvedAt) : null,
                createdAt: new Date(submittedAt),
              }}
            />
          </div>
        </div>
        <p className="text-sm text-fg-muted">Filed {formatDate(submittedAt)}</p>

        <ol className="flex flex-col gap-3 border-t border-border pt-3">
          {events.map((e, i) => (
            <li key={i} className="flex flex-col gap-0.5 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-fg">{EVENT_LABELS[e.type] ?? e.type}</span>
                <span className="text-xs text-fg-muted">{formatDate(e.createdAt)}</span>
              </div>
              {e.remark && <p className="text-fg-muted">{e.remark}</p>}
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}
