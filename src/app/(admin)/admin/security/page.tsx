import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { listAuthEvents } from '@/lib/admin/service'
import { requireAdminActor } from '../../_lib/actor'

export const metadata: Metadata = { title: 'Security trail — SINC-P admin' }

const PAGE_SIZE = 50

// kind is a free varchar column (see auth_events schema comment), not a pgEnum, so this
// is a display lookup only — an unlisted kind still renders, just without a tinted badge.
const KIND_META: Record<string, { label: string; variant: BadgeVariant }> = {
  login_success: { label: 'Login', variant: 'success' },
  login_failure: { label: 'Login failed', variant: 'danger' },
  logout: { label: 'Logout', variant: 'neutral' },
  denied: { label: 'Denied', variant: 'warning' },
  export: { label: 'Export', variant: 'info' },
  password_change: { label: 'Password changed', variant: 'accent' },
}

function formatDate(d: Date): string {
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const actor = await requireAdminActor('/admin/security')
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)

  const { items, total } = await listAuthEvents(actor, { page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-fg">Security trail</h1>
        <p className="text-sm text-fg-muted">
          Read-only. Logins, denials, and exports for this institution — see auth_events in the schema.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No events yet" description="Nothing recorded for this institution." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>When</Th>
              <Th>Event</Th>
              <Th>Email</Th>
              <Th>IP</Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.map((e) => {
              const meta = KIND_META[e.kind]
              return (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap text-fg-muted">{formatDate(e.createdAt)}</Td>
                  <Td>
                    <Badge variant={meta?.variant ?? 'neutral'}>{meta?.label ?? e.kind}</Badge>
                  </Td>
                  <Td className="text-fg-muted">{e.email ?? '—'}</Td>
                  <Td className="text-fg-muted">{e.ipAddress ?? '—'}</Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={(p) => `/admin/security?page=${p}`} />
    </div>
  )
}
