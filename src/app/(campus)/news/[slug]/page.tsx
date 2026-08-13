import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pin } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { getSession } from '@/lib/auth/session'
import { isStaff } from '@/lib/grievance/policy'
import { renderMarkdown } from '@/lib/markdown'
import { getAnnouncementBySlug, NEWS_CHANNELS, type NewsChannel } from '@/lib/news/service'
import { getPublicInstitution } from '@/lib/stats'

const CHANNEL_LABELS: Record<NewsChannel, string> = {
  society: 'Society',
  sports: 'Sports',
  placement: 'Placement',
  academic: 'Academic',
  administrative: 'Administrative',
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const institution = await getPublicInstitution()
  if (!institution) return {}
  const announcement = await getAnnouncementBySlug(institution.id, slug, null)
  return { title: announcement ? `${announcement.title} — SINC-P` : 'News — SINC-P' }
}

export default async function AnnouncementPage({ params }: PageProps) {
  const { slug } = await params
  const [session, institution] = await Promise.all([getSession(), getPublicInstitution()])
  if (!institution) notFound()

  const actor =
    session && isStaff(session.user.role)
      ? { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
      : null

  const announcement = await getAnnouncementBySlug(institution.id, slug, actor)
  if (!announcement) notFound()

  const isPreview = !announcement.publishedAt || announcement.publishedAt > new Date()

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/news" className="inline-flex w-fit items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" />
        Back to news
      </Link>

      {isPreview && (
        <Alert variant="warning" title="Preview">
          This announcement has not been published yet. Only staff can see this.
        </Alert>
      )}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.isPinned && (
            <Badge variant="accent" icon={<Pin aria-hidden className="size-3.5" />}>
              Pinned
            </Badge>
          )}
          <Badge variant="neutral">{CHANNEL_LABELS[announcement.channel as NewsChannel] ?? announcement.channel}</Badge>
          {announcement.publishedAt && <span className="text-xs text-fg-muted">{formatDate(announcement.publishedAt)}</span>}
        </div>
        <h1 className="text-2xl font-semibold text-fg">{announcement.title}</h1>
      </header>

      {/* renderMarkdown escapes every character before it ever builds a tag — see
          src/lib/markdown.ts's header comment. This is the one dangerouslySetInnerHTML
          in this vertical, and it is safe because of what runs before this line, not
          because of anything at this line. */}
      <div
        className="prose-campus flex flex-col gap-3 text-sm text-fg [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(announcement.body) }}
      />
    </article>
  )
}
