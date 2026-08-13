import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PaginationProps {
  page: number
  totalPages: number
  /** Caller builds the href (query string, filters, sort — whatever the list page
   *  already tracks). Runs server-side; nothing here needs to cross a client boundary. */
  buildHref: (page: number) => string
}

export function Pagination({ page, totalPages, buildHref }: PaginationProps) {
  if (totalPages <= 1) return null

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages

  const navClasses =
    'inline-flex items-center gap-1 rounded-md border border-border-strong px-2.5 py-1.5 text-sm text-fg hover:bg-status-neutral-bg aria-disabled:pointer-events-none aria-disabled:opacity-40'

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={prevDisabled}
        tabIndex={prevDisabled ? -1 : undefined}
        className={cn(navClasses)}
      >
        <ChevronLeft aria-hidden className="size-4" />
        Previous
      </Link>
      <p className="text-sm text-fg-muted">
        Page {page} of {totalPages}
      </p>
      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={nextDisabled}
        tabIndex={nextDisabled ? -1 : undefined}
        className={cn(navClasses)}
      >
        Next
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </nav>
  )
}
