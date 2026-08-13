import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, FolderTree, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { listCategories } from '@/lib/admin/service'
import { CsrfField } from '@/components/CsrfField'
import { requireAdminActor } from '../../_lib/actor'
import { setCategoryActiveAction } from './actions'

export const metadata: Metadata = { title: 'Categories — SINC-P admin' }

export default async function AdminCategoriesPage() {
  const actor = await requireAdminActor('/admin/categories')
  const categories = await listCategories(actor)
  const nameById = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-fg">Categories</h1>
        <Link href="/admin/categories/new" className={buttonClasses('primary')}>
          <Plus aria-hidden className="size-4" />
          New category
        </Link>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories yet" description="Create one to let students file into it." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Parent</Th>
              <Th>SLA override</Th>
              <Th>Sensitive</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {categories.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link href={`/admin/categories/${c.id}/edit`} className="font-medium text-fg hover:text-accent">
                    {c.name}
                  </Link>
                </Td>
                <Td className="text-fg-muted">{c.parentId ? (nameById.get(c.parentId) ?? '—') : '—'}</Td>
                <Td className="text-fg-muted">{c.slaResolutionDays ? `${c.slaResolutionDays}d` : 'Institution default'}</Td>
                <Td>
                  {c.isSensitive && (
                    <Badge variant="escalate" icon={<AlertTriangle aria-hidden className="size-3.5" />}>
                      Sensitive
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Badge variant={c.isActive ? 'success' : 'neutralMuted'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
                </Td>
                <Td>
                  <form action={setCategoryActiveAction.bind(null, c.id, !c.isActive)}>
                    <CsrfField />
                    <button type="submit" className={buttonClasses(c.isActive ? 'danger' : 'secondary', 'sm')}>
                      {c.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </form>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  )
}
