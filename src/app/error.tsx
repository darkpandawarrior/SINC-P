'use client'

import { useEffect } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <Alert variant="danger" title="Something went wrong on our side">
        Nothing you typed was filed or changed by this error. Try again, and if it keeps happening, quote this code to the
        grievance cell: {error.digest ?? 'none'}.
      </Alert>
      <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
