import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import type { HandbookEntry } from '@/db/schema'
import { getInstitution, listCategories, listHandbookForCategory } from '@/lib/grievance/service'
import { MAX_BYTES } from '@/lib/storage/local'
import { requireStudentActor } from '../../_lib/actor'
import { CsrfField } from '@/components/CsrfField'
import { buildCategoryTree, type CategoryTreeNode } from './category-tree'
import { GrievanceForm } from './GrievanceForm'
import { MAX_ATTACHMENTS } from './limits'

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

export default async function NewGrievancePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; continue?: string; error?: string }>
}) {
  const { actor } = await requireStudentActor('/my/new')
  const { category: categoryId, continue: continueParam, error } = await searchParams

  const [institution, categories] = await Promise.all([getInstitution(actor), listCategories(actor)])
  const tree = buildCategoryTree(categories)
  const selected = categoryId ? categories.find((c) => c.id === categoryId) : undefined

  const matches =
    selected && continueParam !== '1' ? await listHandbookForCategory(actor, selected.id) : ([] as HandbookEntry[])

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold text-fg">File a grievance</h1>

      {error && <Alert variant="danger" title={error} />}

      {!selected ? (
        <CategoryPicker hadInvalidSelection={Boolean(categoryId)} tree={tree} />
      ) : matches.length > 0 ? (
        <Deflection categoryId={selected.id} entries={matches} />
      ) : (
        <GrievanceForm
          categoryId={selected.id}
          categoryName={selected.name}
          allowAnonymous={institution?.allowAnonymous ?? false}
          maxAttachments={MAX_ATTACHMENTS}
          maxSizeLabel={formatMb(MAX_BYTES)}
          csrf={<CsrfField />}
        />
      )}
    </div>
  )
}

function CategoryPicker({ hadInvalidSelection, tree }: { hadInvalidSelection: boolean; tree: CategoryTreeNode[] }) {
  return (
    <Card>
      <CardBody>
        {hadInvalidSelection && (
          <p className="mb-3 text-sm text-status-danger-fg">That category could not be found. Choose one below.</p>
        )}
        <form className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-medium text-fg">
              What is this about?
            </label>
            <select
              id="category"
              name="category"
              required
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
            >
              <option value="">Choose a category…</option>
              {tree.map((node) =>
                node.children.length === 0 ? (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ) : (
                  <optgroup key={node.id} label={node.name}>
                    {node.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </select>
          </div>
          <Button type="submit">Continue</Button>
        </form>
      </CardBody>
    </Card>
  )
}

/** Roughly a third of a campus complaint box is a question with a documented answer —
 *  this is the whole reason this two-step form exists instead of a single page. */
function Deflection({ categoryId, entries }: { categoryId: string; entries: HandbookEntry[] }) {
  const qs = (extra: Record<string, string>) => new URLSearchParams({ category: categoryId, ...extra })

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium text-fg">Is this what you needed?</h2>
          <p className="text-sm text-fg-muted">These are already documented and don&apos;t need a grievance.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium text-fg">{e.question}</p>
              <p className="mt-1 text-sm text-fg-muted">{e.answer}</p>
              {e.owningOffice && <p className="mt-1 text-xs text-fg-muted">— {e.owningOffice}</p>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3 border-t border-border pt-3">
          <Link href={`/my/new?${qs({ continue: '1' })}`} className="text-sm font-medium text-accent hover:underline">
            None of these — continue filing a grievance
          </Link>
          <Link href="/my/new" className="text-sm text-fg-muted hover:underline">
            Choose a different category
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
