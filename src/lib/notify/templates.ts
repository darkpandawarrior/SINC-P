/**
 * What the messages actually say.
 *
 * Plain text, no HTML, no images, no tracking pixel. These go to students on patchy
 * connections and to a Registrar's office running whatever mail client the university
 * standardised on in 2014, and a grievance notification is not a marketing email.
 *
 * Every message quotes the reference number, because that is the thing a student reads
 * out at a counter, and states the statutory deadline where one applies, because the
 * deadline is the product.
 */
import type { Grievance, Institution } from '@/db/schema'
import type { NotificationKind } from './outbox'

interface Rendered {
  subject: string
  body: string
}

const STATUS_WORDS: Record<Grievance['status'], string> = {
  submitted: 'received',
  under_review: 'under review',
  in_progress: 'being worked on',
  resolved: 'resolved, pending your confirmation',
  closed: 'closed',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  appealed: 'under appeal with the Ombudsperson',
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

function signature(institution: Pick<Institution, 'name'>): string {
  return `\n\n${institution.name}\nStudent Grievance Redressal\n\nThis is an automated message. Replies are not monitored.`
}

export function grievanceSubmitted(
  grievance: Pick<Grievance, 'reference' | 'subject' | 'dueAt'>,
  institution: Pick<Institution, 'name'>,
): Rendered {
  const due = grievance.dueAt
    ? `\n\nUnder the UGC (Redressal of Grievances of Students) Regulations, 2023, this should be resolved by ${formatDate(grievance.dueAt)}.`
    : ''
  return {
    subject: `Grievance ${grievance.reference} received`,
    body:
      `Your grievance has been received and given the reference ${grievance.reference}.\n\n` +
      `Subject: ${grievance.subject}\n\n` +
      `Quote this reference in any follow-up. You can check its progress at any time, ` +
      `with or without signing in.${due}${signature(institution)}`,
  }
}

export function statusChanged(
  grievance: Pick<Grievance, 'reference' | 'subject' | 'status' | 'dueAt'>,
  institution: Pick<Institution, 'name'>,
  remark: string | null,
): Rendered {
  const note = remark ? `\n\nRemark from the committee:\n${remark}\n` : ''
  const nextStep =
    grievance.status === 'resolved'
      ? '\n\nIf this resolves the matter, please confirm it. If it does not, you may appeal to the Ombudsperson.'
      : ''
  return {
    subject: `${grievance.reference} is now ${STATUS_WORDS[grievance.status]}`,
    body:
      `Grievance ${grievance.reference} ("${grievance.subject}") is now ` +
      `${STATUS_WORDS[grievance.status]}.${note}${nextStep}${signature(institution)}`,
  }
}

export function assigned(
  grievance: Pick<Grievance, 'reference' | 'subject' | 'dueAt'>,
  institution: Pick<Institution, 'name'>,
): Rendered {
  const due = grievance.dueAt ? ` It is due by ${formatDate(grievance.dueAt)}.` : ''
  return {
    subject: `Assigned to you: ${grievance.reference}`,
    body:
      `Grievance ${grievance.reference} ("${grievance.subject}") has been assigned to you.${due}` +
      `\n\nOpen the officer console to review it.${signature(institution)}`,
  }
}

export function slaBreached(
  grievance: Pick<Grievance, 'reference' | 'subject' | 'dueAt'>,
  institution: Pick<Institution, 'name'>,
  daysOverdue: number,
): Rendered {
  return {
    subject: `OVERDUE: ${grievance.reference} passed its statutory deadline`,
    body:
      `Grievance ${grievance.reference} ("${grievance.subject}") is ${daysOverdue} day` +
      `${daysOverdue === 1 ? '' : 's'} past the deadline it was required to be resolved by` +
      `${grievance.dueAt ? ` (${formatDate(grievance.dueAt)})` : ''}.\n\n` +
      `A breach is recorded permanently in the grievance's audit trail and will appear in ` +
      `the institution's compliance report.${signature(institution)}`,
  }
}

export function appealFiled(
  appeal: Pick<Grievance, 'reference' | 'subject'>,
  original: Pick<Grievance, 'reference'>,
  institution: Pick<Institution, 'name'>,
): Rendered {
  return {
    subject: `Appeal filed: ${appeal.reference}`,
    body:
      `An appeal has been filed against the decision on ${original.reference}.\n\n` +
      `Appeal reference: ${appeal.reference}\nSubject: ${appeal.subject}\n\n` +
      `Under the UGC Regulations the Ombudsperson is required to hear this.${signature(institution)}`,
  }
}

/** Used by the dedupe key so a repeated sweep cannot send the same thing twice. */
export function dedupeKeyFor(kind: NotificationKind, grievanceId: string, discriminator = ''): string {
  return discriminator ? `${kind}:${grievanceId}:${discriminator}` : `${kind}:${grievanceId}`
}
