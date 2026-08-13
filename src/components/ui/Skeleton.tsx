import { cn } from '@/lib/cn'

/**
 * A loading placeholder shaped like the thing that is coming.
 *
 * Paired with Suspense so the officer console streams: filters and chrome paint
 * immediately, the table arrives when the query does. A spinner would say "something is
 * happening"; this says "a table of about this size is happening", which is the
 * difference between waiting and wondering.
 *
 * aria-hidden on purpose. A screen reader should hear the region's busy state from the
 * live region around it, not a description of grey rectangles.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-md', className)} />
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-3" aria-busy="true">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full opacity-[calc(1-var(--i)*0.06)]" />
      ))}
    </div>
  )
}
