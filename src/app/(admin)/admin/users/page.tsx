import type { Metadata } from 'next'
import Link from 'next/link'
import { Users as UsersIcon } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { listUsers } from '@/lib/admin/service'
import type { Role } from '@/lib/grievance/policy'
import { requireAdminActor } from '../../_lib/actor'
import { ROLE_LABELS } from '../../_lib/role-labels'
import { CsrfField } from '@/components/CsrfField'
import { setUserActiveAction, setUserRoleAction } from './actions'
import { InviteUserForm } from './InviteUserForm'

export const metadata: Metadata = { title: 'Users — SINC-P admin' }

const PAGE_SIZE = 25
const ROLE_VALUES = Object.keys(ROLE_LABELS) as Role[]

interface PageProps {
  searchParams: Promise<{ role?: string; page?: string }>
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const actor = await requireAdminActor('/admin/users')
  const { role: roleParam, page: pageParam } = await searchParams
  const role = ROLE_VALUES.includes(roleParam as Role) ? (roleParam as Role) : undefined
  const page = Math.max(1, Number(pageParam) || 1)

  const { items, total } = await listUsers(actor, { role, page, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildHref = (p: number) => {
    const q = new URLSearchParams()
    if (role) q.set('role', role)
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return `/admin/users${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-fg">Users</h1>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Invite staff or a student</h2>
        </CardHeader>
        <CardBody>
          <InviteUserForm csrfField={<CsrfField />} />
        </CardBody>
      </Card>

      <nav aria-label="Role filter" className="flex flex-wrap gap-2">
        <Link
          href="/admin/users"
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${!role ? 'border-accent bg-accent-soft-bg text-accent-soft-fg' : 'border-border-strong text-fg hover:bg-status-neutral-bg'}`}
        >
          All
        </Link>
        {ROLE_VALUES.map((r) => (
          <Link
            key={r}
            href={`/admin/users?role=${r}`}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium ${role === r ? 'border-accent bg-accent-soft-bg text-accent-soft-fg' : 'border-border-strong text-fg hover:bg-status-neutral-bg'}`}
          >
            {ROLE_LABELS[r]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users" description="Nothing matches this filter yet." />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {items.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium">{u.fullName}</Td>
                <Td className="text-fg-muted">{u.email}</Td>
                <Td>
                  {u.id === actor.id ? (
                    <Badge variant="neutral">{ROLE_LABELS[u.role]}</Badge>
                  ) : (
                    <form action={setUserRoleAction.bind(null, u.id)} className="flex items-center gap-1.5">
                      <CsrfField />
                      <select
                        name="role"
                        defaultValue={u.role}
                        className="rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-fg"
                      >
                        {ROLE_VALUES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={buttonClasses('ghost', 'sm')}>
                        Save
                      </button>
                    </form>
                  )}
                </Td>
                <Td>
                  <Badge variant={u.isActive ? 'success' : 'neutralMuted'}>{u.isActive ? 'Active' : 'Deactivated'}</Badge>
                </Td>
                <Td>
                  {u.id !== actor.id && (
                    <form action={setUserActiveAction.bind(null, u.id, !u.isActive)}>
                      <CsrfField />
                      <button type="submit" className={buttonClasses(u.isActive ? 'danger' : 'secondary', 'sm')}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </form>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
    </div>
  )
}
