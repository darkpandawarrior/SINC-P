import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, Pin, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { getSession } from '@/lib/auth/session'
import { isStaff } from '@/lib/grievance/policy'
import { listDraftAnnouncements, listPublicAnnouncements, NEWS_CHANNELS, type NewsChannel } from '@/lib/news/service'
import { getPublicInstitution } from '@/lib/stats'
import { expireAnnouncementAction, publishAnnouncementAction } from './actions'

export const metadata: Metadata = { title: 'News — SINC-P' }

const CHANNEL_LABELS: Record<NewsChannel, string> = {
  society: 'Society',
  sports: 'Sports',
  placement: 'Placement',
  academic: 'Academic',
  administrative: 'Administrative',
}

const PAGE_SIZE = 20

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface PageProps {
  searchParams: Promise<{ channel?: string; page?: string }>
}

export default async function NewsPage({ searchParams }: PageProps) {
  const { channel: channelParam, page: pageParam } = await searchParams
  const channel = (NEWS_CHANNELS as readonly string[]).includes(channelParam ?? '')
    ? (channelParam as NewsChannel)
    : undefined
  const page = Math.max(1, Number(pageParam) || 1)

  const [session, institution] = await Promise.all([getSession(), getPublicInstitution()])
  const staffActor =
    session && isStaff(session.user.role)
      ? { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
      : null

  if (!institution) {
    return <EmptyState icon={Newspaper} title="Not configured yet" description="No institution is set up on this deployment." />
  }

  const [{ items, total }, drafts] = await Promise.all([
    listPublicAnnouncements(institution.id, { channel, page, pageSize: PAGE_SIZE }),
    staffActor ? listDraftAnnouncements(staffActor) : Promise.resolve([]),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildHref = (p: number) => {
    const q = new URLSearchParams()
    if (channel) q.set('channel', channel)
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return `/news${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-fg">News</h1>
        {staffActor && (
          <Link href="/news/new" className={buttonClasses('primary')}>
            <Plus aria-hidden className="size-4" />
            New announcement
          </Link>
        )}
      </div>

      <nav aria-label="Channel" className="flex flex-wrap gap-2">
        <Link
          href="/news"
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${!channel ? 'border-accent bg-accent-soft-bg text-accent-soft-fg' : 'border-border-strong text-fg hover:bg-status-neutral-bg'}`}
        >
          All
        </Link>
        {NEWS_CHANNELS.map((c) => (
          <Link
            key={c}
            href={`/news?channel=${c}`}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${channel === c ? 'border-accent bg-accent-soft-bg text-accent-soft-fg' : 'border-border-strong text-fg hover:bg-status-neutral-bg'}`}
          >
            {CHANNEL_LABELS[c]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={Newspaper} title="No announcements" description="Nothing published for this filter yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardBody className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.isPinned && (
                      <Badge variant="accent" icon={<Pin aria-hidden className="size-3.5" />}>
                        Pinned
                      </Badge>
                    )}
                    <Badge variant="neutral">{CHANNEL_LABELS[a.channel as NewsChannel] ?? a.channel}</Badge>
                    <span className="text-xs text-fg-muted">{a.publishedAt && formatDate(a.publishedAt)}</span>
                  </div>
                  <Link href={`/news/${a.slug}`} className="text-lg font-semibold text-fg hover:text-accent">
                    {a.title}
                  </Link>
                  {a.summary && <p className="text-sm text-fg-muted">{a.summary}</p>}
                </div>
                {staffActor && (
                  <form action={expireAnnouncementAction.bind(null, a.id)}>
                    <button type="submit" className={buttonClasses('ghost', 'sm')}>
                      Expire
                    </button>
                  </form>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />

      {staffActor && drafts.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Drafts</h2>
          {drafts.map((d) => (
            <Card key={d.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-fg">{d.title}</p>
                  <p className="text-xs text-fg-muted">
                    {CHANNEL_LABELS[d.channel as NewsChannel] ?? d.channel} · not published
                  </p>
                </div>
                <form action={publishAnnouncementAction.bind(null, d.id)}>
                  <button type="submit" className={buttonClasses('secondary', 'sm')}>
                    Publish
                  </button>
                </form>
              </CardBody>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}
