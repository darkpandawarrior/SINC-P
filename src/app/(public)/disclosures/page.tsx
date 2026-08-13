/**
 * The UGC-mandated statutory publication page. Scoped to what the regulation actually
 * requires published, not a general CMS: SGRC composition, the Ombudsperson's contact,
 * the anti-ragging routing, and the grievance procedure with its timelines.
 *
 * Everything below is derived from real rows — the staff roster, the SLA config, the
 * categories flagged sensitive — never a separate "disclosures" content table. schema.ts
 * is frozen and doesn't model committee membership or a fee schedule as their own
 * objects, so this page shows what the data actually contains rather than inventing a
 * config surface for two fields. Committee names and the Ombudsperson's contact are
 * public officials' details, not student data — nothing here goes through the
 * small-cell suppression that stats.ts enforces for grievance counts.
 */
import type { Metadata } from 'next'
import { and, eq, inArray } from 'drizzle-orm'
import { withTenant } from '@/db/client'
import { categories, users, type User } from '@/db/schema'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { getPublicInstitution } from '@/lib/stats'

export const metadata: Metadata = {
  title: 'SINC-P — Disclosures',
  description: 'SGRC composition, Ombudsperson contact, and the grievance procedure.',
}

const ROLE_LABELS: Record<string, string> = {
  institution_admin: 'Institution Administrator',
  redressal_officer: 'Redressal Officer (SGRC Member)',
  moderator: 'Grievance Coordinator',
}

const STAFF_ROLES = ['institution_admin', 'redressal_officer', 'moderator'] as const

type RosterRow = Pick<User, 'id' | 'fullName' | 'role' | 'email' | 'department'>

async function getDisclosureRoster(institutionId: string): Promise<RosterRow[]> {
  return withTenant(institutionId, (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, role: users.role, email: users.email, department: users.department })
      .from(users)
      .where(
        and(
          eq(users.institutionId, institutionId),
          eq(users.isActive, true),
          inArray(users.role, ['institution_admin', 'redressal_officer', 'moderator', 'ombudsperson']),
        ),
      )
      .orderBy(users.role, users.fullName),
  )
}

interface DisclosureCategory {
  id: string
  name: string
  isSensitive: boolean
  slaResolutionDays: number | null
}

async function getDisclosureCategories(institutionId: string): Promise<DisclosureCategory[]> {
  return withTenant(institutionId, (tx) =>
    tx
      .select({
        id: categories.id,
        name: categories.name,
        isSensitive: categories.isSensitive,
        slaResolutionDays: categories.slaResolutionDays,
      })
      .from(categories)
      .where(and(eq(categories.institutionId, institutionId), eq(categories.isActive, true)))
      .orderBy(categories.sortOrder, categories.name),
  )
}

export default async function DisclosuresPage() {
  const institution = await getPublicInstitution()
  if (!institution) {
    return <EmptyState title="Not configured yet" description="No institution is set up on this deployment." />
  }

  const [roster, cats] = await Promise.all([
    getDisclosureRoster(institution.id),
    getDisclosureCategories(institution.id),
  ])

  const sgrc = roster.filter((r) => (STAFF_ROLES as readonly string[]).includes(r.role))
  const ombudspersons = roster.filter((r) => r.role === 'ombudsperson')
  const sensitiveCategories = cats.filter((c) => c.isSensitive)
  const slaOverrides = cats.filter((c) => c.slaResolutionDays !== null)

  return (
    <div data-surface="public" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg">Statutory Disclosures — {institution.name}</h1>
        <p className="max-w-2xl text-fg-muted">
          Published as required by the UGC (Redressal of Grievances of Students) Regulations,
          2023: the composition of the Student Grievance Redressal Committee, the Ombudsperson&apos;s
          contact, and the grievance procedure with its timelines.
        </p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Student Grievance Redressal Committee</h2>
        </CardHeader>
        <CardBody>
          {sgrc.length === 0 ? (
            <p className="text-sm text-fg-muted">No committee members have been added yet.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <Th>Contact</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sgrc.map((r) => (
                  <Tr key={r.id}>
                    <Td>{r.fullName}</Td>
                    <Td>{ROLE_LABELS[r.role] ?? r.role}</Td>
                    <Td>{r.department ?? '—'}</Td>
                    <Td>{r.email}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Ombudsperson</h2>
        </CardHeader>
        <CardBody>
          {ombudspersons.length === 0 ? (
            <p className="text-sm text-fg-muted">No Ombudsperson has been appointed yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-fg">
              {ombudspersons.map((o) => (
                <li key={o.id}>
                  {o.fullName} — <span className="text-fg-muted">{o.email}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-fg-muted">
            Hears appeals against SGRC decisions, within {institution.slaOmbudspersonDays} days of an
            appeal being filed.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Ragging and harassment</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 text-sm text-fg-muted">
          <p>
            Grievances filed under a category flagged sensitive bypass moderator triage and route
            directly to a redressal officer:
          </p>
          {sensitiveCategories.length === 0 ? (
            <p>No category is currently flagged sensitive.</p>
          ) : (
            <ul className="list-inside list-disc text-fg">
              {sensitiveCategories.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          )}
          <p>You may file anonymously; your identity is withheld from the committee UI.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Grievance procedure and timelines</h2>
        </CardHeader>
        <CardBody className="flex flex-col gap-2 text-sm text-fg-muted">
          <ol className="list-inside list-decimal text-fg">
            <li>File through the portal. A moderator screens and routes it to a redressal officer.</li>
            <li>The officer investigates and resolves within {institution.slaResolutionDays} days.</li>
            <li>
              If unsatisfied, appeal to the Ombudsperson within {institution.slaAppealWindowDays} days of
              the decision. The Ombudsperson hears it within {institution.slaOmbudspersonDays} days.
            </li>
          </ol>
          {slaOverrides.length > 0 && (
            <>
              <p className="mt-2 font-medium text-fg">Category-specific timelines</p>
              <ul className="list-inside list-disc text-fg">
                {slaOverrides.map((c) => (
                  <li key={c.id}>
                    {c.name}: {c.slaResolutionDays} days
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-fg">Fee structure</h2>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-fg-muted">
            Fee structure and refund policy are published separately by the Accounts Office and are
            not tracked by this system. Contact the Accounts Office, or raise a Fees &amp;
            Scholarship grievance if a charge appears incorrect.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
