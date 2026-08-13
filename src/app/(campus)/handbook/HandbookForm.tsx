import type { Category } from '@/db/schema'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { CsrfField } from '@/components/CsrfField'

interface HandbookFormProps {
  action: (formData: FormData) => Promise<void>
  categories: Category[]
  submitLabel: string
  defaults?: {
    question: string
    answer: string
    categoryId: string | null
    owningOffice: string | null
    isPublished: boolean
  }
}

/** Shared by new/page.tsx and [slug]/edit/page.tsx — a create and an edit form are the
 *  same fields with different defaults and a different action, and this repo would
 *  rather have one form drift than two. */
export function HandbookForm({ action, categories, submitLabel, defaults }: HandbookFormProps) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <CsrfField />
      <Field id="question" name="question" label="Question" required maxLength={300} defaultValue={defaults?.question} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="answer" className="text-sm font-medium text-fg">
          Answer <span className="text-status-danger-fg">*</span>
        </label>
        <textarea
          id="answer"
          name="answer"
          required
          rows={8}
          defaultValue={defaults?.answer}
          placeholder="Markdown supported: **bold**, *italic*, [links](https://…), lists, headings."
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="categoryId" className="text-sm font-medium text-fg">
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={defaults?.categoryId ?? ''}
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Field
        id="owningOffice"
        name="owningOffice"
        label="Owning office"
        hint="e.g. Hostel Office — so a wrong answer has an owner."
        maxLength={200}
        defaultValue={defaults?.owningOffice ?? undefined}
      />

      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isPublished" className="size-4" defaultChecked={defaults?.isPublished ?? false} />
        Published (visible to students)
      </label>

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
