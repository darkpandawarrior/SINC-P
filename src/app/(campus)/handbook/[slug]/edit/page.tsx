import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Card, CardBody } from '@/components/ui/Card'
import { listCategories } from '@/lib/grievance/service'
import { getHandbookEntryBySlug } from '@/lib/handbook/service'
import { requireStaffActor } from '../../../_lib/actor'
import { updateHandbookEntryAction } from '../../actions'
import { HandbookForm } from '../../HandbookForm'

export const metadata: Metadata = { title: 'Edit handbook entry — SINC-P' }

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the required fields and try again.',
  csrf: 'Your session expired. Please try again.',
}

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function EditHandbookEntryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const actor = await requireStaffActor(`/handbook/${slug}/edit`)
  const { error } = await searchParams

  // requireStaffActor already confirms actor is staff, so passing it here just gets the
  // entry regardless of publish state rather than re-deriving that same check.
  const entry = await getHandbookEntryBySlug(actor.institutionId, slug, actor)
  if (!entry) notFound()

  const categories = await listCategories(actor)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">Edit handbook entry</h1>
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <HandbookForm
            action={updateHandbookEntryAction.bind(null, entry.id, entry.slug)}
            categories={categories}
            submitLabel="Save changes"
            defaults={{
              question: entry.question,
              answer: entry.answer,
              categoryId: entry.categoryId,
              owningOffice: entry.owningOffice,
              isPublished: entry.isPublished,
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
