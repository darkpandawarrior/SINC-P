import { NextResponse } from 'next/server'
import { complianceCsv } from '@/lib/grievance/compliance'
import { complianceSnapshot } from '@/lib/grievance/service'
import { requireStaffActor } from '../../../_lib/actor'

function parseDateParam(v: string | null): Date | undefined {
  if (!v) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Same query params, same underlying snapshot as the compliance page — this route
 *  exists only to hand the identical numbers back as one flat CSV a Registrar can
 *  paste into the NAAC self-study annexe, not to compute anything new. */
export async function GET(request: Request) {
  const actor = await requireStaffActor()
  const url = new URL(request.url)
  const since = parseDateParam(url.searchParams.get('since'))
  const until = parseDateParam(url.searchParams.get('until'))

  const stats = await complianceSnapshot(actor, { since, until })
  if (!stats) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const csv = complianceCsv(stats)
  const filename = `sinc-p-compliance-${stats.cycleStart.toISOString().slice(0, 10)}-to-${stats.cycleEnd.toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
