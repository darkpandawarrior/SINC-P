import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
