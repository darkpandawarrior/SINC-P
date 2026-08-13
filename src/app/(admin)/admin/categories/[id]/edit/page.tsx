import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Card, CardBody } from '@/components/ui/Card'
import { listCategories } from '@/lib/admin/service'
import { requireAdminActor } from '../../../../_lib/actor'
import { updateCategoryAction } from '../../actions'
import { CategoryForm } from '../../CategoryForm'

export const metadata: Metadata = { title: 'Edit category — SINC-P admin' }

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the required fields and try again.',
  csrf: 'Your session expired. Please try again.',
  cycle: 'A category cannot be its own parent.',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function EditCategoryPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const actor = await requireAdminActor('/admin/categories')
  const { error } = await searchParams

  // Same "list is small, filter in JS" call as (campus)/handbook/service.ts makes for
  // its own category dropdown — admin/service.ts exposes no getCategory, and a
  // second query for a table this size would only add a round trip.
  const categories = await listCategories(actor)
  const category = categories.find((c) => c.id === id)
  if (!category) notFound()
  const topLevel = categories.filter((c) => c.parentId === null)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">Edit category</h1>
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <CategoryForm
            action={updateCategoryAction.bind(null, category.id)}
            topLevelCategories={topLevel}
            excludeId={category.id}
            submitLabel="Save changes"
            defaults={{
              name: category.name,
              description: category.description,
              parentId: category.parentId,
              slaResolutionDays: category.slaResolutionDays,
              isSensitive: category.isSensitive,
              sortOrder: category.sortOrder,
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
