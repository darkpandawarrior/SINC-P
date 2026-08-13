import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { getInstitutionSettings } from '@/lib/admin/service'
import { CsrfField } from '@/components/CsrfField'
import { requireAdminActor } from '../../_lib/actor'
import { updateInstitutionSettingsAction } from './actions'

export const metadata: Metadata = { title: 'Institution settings — SINC-P admin' }

const ERROR_COPY: Record<string, string> = {
  invalid: 'Please check the fields and try again.',
  csrf: 'Your session expired. Please try again.',
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const actor = await requireAdminActor('/admin/settings')
  const { error, saved } = await searchParams
  const institution = await getInstitutionSettings(actor)
  if (!institution) notFound()

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">Institution settings</h1>
      {saved && !error && <Alert variant="success" title="Settings saved" />}
      {error && <Alert variant="danger" title={ERROR_COPY[error] ?? 'Something went wrong. Please try again.'} />}

      <Card>
        <CardBody>
          <form action={updateInstitutionSettingsAction} className="flex flex-col gap-4">
            <CsrfField />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                id="slaResolutionDays"
                name="slaResolutionDays"
                type="number"
                min={1}
                max={365}
                required
                label="Resolution SLA (days)"
                hint="UGC 2023 default: 15"
                defaultValue={institution.slaResolutionDays}
              />
              <Field
                id="slaAppealWindowDays"
                name="slaAppealWindowDays"
                type="number"
                min={1}
                max={365}
                required
                label="Appeal window (days)"
                hint="Default: 15"
                defaultValue={institution.slaAppealWindowDays}
              />
              <Field
                id="slaOmbudspersonDays"
                name="slaOmbudspersonDays"
                type="number"
                min={1}
                max={365}
                required
                label="Ombudsperson SLA (days)"
                hint="Default: 30"
                defaultValue={institution.slaOmbudspersonDays}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name="allowAnonymous"
                className="size-4"
                defaultChecked={institution.allowAnonymous}
              />
              Allow students to file anonymously (identity withheld from staff, retained for audit)
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
