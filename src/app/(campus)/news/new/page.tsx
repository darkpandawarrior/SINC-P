import type { Metadata } from 'next'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { NEWS_CHANNELS } from '@/lib/news/service'
import { requireStaffActor } from '../../_lib/actor'
import { CsrfField } from '@/components/CsrfField'
import { createAnnouncementAction } from '../actions'

export const metadata: Metadata = { title: 'New announcement — SINC-P' }

const CHANNEL_LABELS: Record<(typeof NEWS_CHANNELS)[number], string> = {
  society: 'Society',
  sports: 'Sports',
  placement: 'Placement',
  academic: 'Academic',
  administrative: 'Administrative',
}

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the required fields and try again.',
  csrf: 'Your session expired. Please try again.',
}

export default async function NewAnnouncementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireStaffActor('/news/new')
  const { error } = await searchParams

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">New announcement</h1>
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <form action={createAnnouncementAction} className="flex flex-col gap-4">
            <CsrfField />
            <Field id="title" name="title" label="Title" required maxLength={200} />
            <Field id="summary" name="summary" label="Summary" hint="Optional, shown in the list. One or two lines." maxLength={300} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="channel" className="text-sm font-medium text-fg">
                Channel <span className="text-status-danger-fg">*</span>
              </label>
              <select
                id="channel"
                name="channel"
                required
                defaultValue=""
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="" disabled>
                  Choose a channel
                </option>
                {NEWS_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="body" className="text-sm font-medium text-fg">
                Body <span className="text-status-danger-fg">*</span>
              </label>
              <textarea
                id="body"
                name="body"
                required
                rows={10}
                placeholder="Markdown supported: **bold**, *italic*, [links](https://…), lists, headings."
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="isPinned" className="size-4" />
              Pin to the top of the list
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="publishNow" className="size-4" defaultChecked />
              Publish now (leave unchecked to save as a draft)
            </label>

            <div className="flex justify-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
