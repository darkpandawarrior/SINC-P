import type { Metadata } from 'next'
import { Alert } from '@/components/ui/Alert'
import { Card, CardBody } from '@/components/ui/Card'
import { listCategories } from '@/lib/admin/service'
import { requireAdminActor } from '../../../_lib/actor'
import { createCategoryAction } from '../actions'
import { CategoryForm } from '../CategoryForm'

export const metadata: Metadata = { title: 'New category — SINC-P admin' }

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the required fields and try again.',
  csrf: 'Your session expired. Please try again.',
}

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireAdminActor('/admin/categories/new')
  const { error } = await searchParams
  const categories = await listCategories(actor)
  const topLevel = categories.filter((c) => c.parentId === null)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">New category</h1>
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <CategoryForm action={createCategoryAction} topLevelCategories={topLevel} submitLabel="Create" />
        </CardBody>
      </Card>
    </div>
  )
}
