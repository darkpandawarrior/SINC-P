import type { Category } from '@/db/schema'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { CsrfField } from '@/components/CsrfField'

interface CategoryFormProps {
  action: (formData: FormData) => Promise<void>
  /** Top-level categories only — the filing form (category-tree.ts) only ever renders
   *  two levels, so a parent-of-a-parent here would create a group the student filing
   *  form can't display. `excludeId` drops the category being edited, so it can't
   *  become its own parent (updateCategory also rejects this — see admin/service.ts). */
  topLevelCategories: Category[]
  excludeId?: string
  submitLabel: string
  defaults?: {
    name: string
    description: string | null
    parentId: string | null
    slaResolutionDays: number | null
    isSensitive: boolean
    sortOrder: number
  }
}

export function CategoryForm({ action, topLevelCategories, excludeId, submitLabel, defaults }: CategoryFormProps) {
  const parentOptions = topLevelCategories.filter((c) => c.id !== excludeId)

  return (
    <form action={action} className="flex flex-col gap-4">
      <CsrfField />
      <Field id="name" name="name" label="Name" required maxLength={200} defaultValue={defaults?.name} />
      <Field
        id="description"
        name="description"
        label="Description"
        hint="Optional"
        maxLength={2000}
        defaultValue={defaults?.description ?? undefined}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="parentId" className="text-sm font-medium text-fg">
          Parent category
        </label>
        <select
          id="parentId"
          name="parentId"
          defaultValue={defaults?.parentId ?? ''}
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
        >
          <option value="">None (top level)</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="slaResolutionDays"
          name="slaResolutionDays"
          type="number"
          min={1}
          max={365}
          label="SLA override (days)"
          hint="Leave blank to use the institution default"
          defaultValue={defaults?.slaResolutionDays ?? undefined}
        />
        <Field
          id="sortOrder"
          name="sortOrder"
          type="number"
          label="Sort order"
          hint="Lower numbers appear first"
          defaultValue={defaults?.sortOrder ?? 0}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isSensitive" className="size-4" defaultChecked={defaults?.isSensitive ?? false} />
        Sensitive (bypasses moderator triage, pages a redressal officer directly — ragging/harassment)
      </label>

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
