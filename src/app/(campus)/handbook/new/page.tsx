import type { Metadata } from 'next'
import { Alert } from '@/components/ui/Alert'
import { Card, CardBody } from '@/components/ui/Card'
import { listCategories } from '@/lib/grievance/service'
import { requireStaffActor } from '../../_lib/actor'
import { createHandbookEntryAction } from '../actions'
import { HandbookForm } from '../HandbookForm'

export const metadata: Metadata = { title: 'New handbook entry — SINC-P' }

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the required fields and try again.',
  csrf: 'Your session expired. Please try again.',
}

export default async function NewHandbookEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const actor = await requireStaffActor('/handbook/new')
  const { error } = await searchParams
  const categories = await listCategories(actor)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">New handbook entry</h1>
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <HandbookForm action={createHandbookEntryAction} categories={categories} submitLabel="Save" />
        </CardBody>
      </Card>
    </div>
  )
}
