import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { getSession } from '@/lib/auth/session'
import { isStaff } from '@/lib/grievance/policy'
import { getHandbookEntryBySlug, isStale } from '@/lib/handbook/service'
import { renderMarkdown } from '@/lib/markdown'
import { getPublicInstitution } from '@/lib/stats'
import { voteHelpfulAction } from '../actions'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const institution = await getPublicInstitution()
  if (!institution) return {}
  const entry = await getHandbookEntryBySlug(institution.id, slug, null)
  return { title: entry ? `${entry.question} — SINC-P` : 'Handbook — SINC-P' }
}

export default async function HandbookEntryPage({ params }: PageProps) {
  const { slug } = await params
  const [session, institution] = await Promise.all([getSession(), getPublicInstitution()])
  if (!institution) notFound()

  const actor =
    session && isStaff(session.user.role)
      ? { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
      : null

  const entry = await getHandbookEntryBySlug(institution.id, slug, actor)
  if (!entry) notFound()

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/handbook" className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Back to handbook
      </Link>

      {!entry.isPublished && (
        <Alert variant="warning" title="Draft">
          This entry has not been published yet. Only staff can see this.
        </Alert>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {actor && isStale(entry) && (
            <Badge variant="warning" icon={<AlertTriangle aria-hidden className="size-3.5" />}>
              Review overdue
            </Badge>
          )}
          {entry.owningOffice && <Badge variant="neutral">{entry.owningOffice}</Badge>}
        </div>
        <h1 className="text-2xl font-semibold text-fg">{entry.question}</h1>
      </header>

      {/* Same escape-then-build pipeline as news/[slug] — see markdown.ts's header
          comment for why this dangerouslySetInnerHTML is safe. */}
      <div
        className="flex flex-col gap-3 text-sm text-fg [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.answer) }}
      />

      {entry.isPublished && (
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <span className="text-sm text-fg-muted">Was this helpful?</span>
          <form action={voteHelpfulAction.bind(null, entry.id, true)}>
            <button type="submit" className={buttonClasses('secondary', 'sm')}>
              <ThumbsUp aria-hidden className="size-4" />
              Yes ({entry.helpfulCount})
            </button>
          </form>
          <form action={voteHelpfulAction.bind(null, entry.id, false)}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>
              <ThumbsDown aria-hidden className="size-4" />
              No ({entry.notHelpfulCount})
            </button>
          </form>
        </div>
      )}

      {actor && (
        <div>
          <Link href={`/handbook/${entry.slug}/edit`} className={buttonClasses('secondary', 'sm')}>
            Edit
          </Link>
        </div>
      )}
    </article>
  )
}
