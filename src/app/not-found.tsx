import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { buttonClasses } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="We could not find that page"
      description="The link may be old, or the grievance reference may be mistyped."
      action={
        <Link href="/" className={buttonClasses('secondary', 'sm')}>
          Back to the home page
        </Link>
      }
    />
  )
}
