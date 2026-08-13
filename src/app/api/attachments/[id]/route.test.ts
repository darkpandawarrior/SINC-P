/**
 * Integration test: exercises `loadAuthorizedAttachment` against a real Postgres
 * (withTenant, RLS, the lot) — not a mock of withTenant or canView, per house rule.
 * Needs a reachable DATABASE_URL with the schema + RLS migrations applied:
 *
 *   npm run db:up && npx drizzle-kit push && psql "$DATABASE_URL" -f drizzle/0001_rls.sql
 *   npm test -- route.test.ts
 */
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbAvailable, SKIP_REASON } from '@/test/db'
import { pool, withoutTenantScope } from '@/db/client'
import { attachments, grievances, institutions, users } from '@/db/schema'
import type { Actor } from '@/lib/grievance/policy'
import { loadAuthorizedAttachment } from './route'

describe.skipIf(!dbAvailable)('loadAuthorizedAttachment — the 2019 IDOR', () => {
  const instA = randomUUID()
  const instB = randomUUID()
  const filingStudent = randomUUID()
  const otherStudentSameInstitution = randomUUID()
  const studentAnotherInstitution = randomUUID()
  const grievanceId = randomUUID()
  const attachmentId = randomUUID()

  beforeAll(async () => {
    await withoutTenantScope('integration test fixture', async (tx) => {
      await tx.insert(institutions).values([
        { id: instA, slug: `test-inst-a-${instA.slice(0, 8)}`, name: 'Test Institution A' },
        { id: instB, slug: `test-inst-b-${instB.slice(0, 8)}`, name: 'Test Institution B' },
      ])
      await tx.insert(users).values([
        {
          id: filingStudent,
          institutionId: instA,
          email: 'filer@a.test',
          fullName: 'Filer',
          passwordHash: 'x',
          role: 'student',
        },
        {
          id: otherStudentSameInstitution,
          institutionId: instA,
          email: 'other@a.test',
          fullName: 'Other',
          passwordHash: 'x',
          role: 'student',
        },
        {
          id: studentAnotherInstitution,
          institutionId: instB,
          email: 'stranger@b.test',
          fullName: 'Stranger',
          passwordHash: 'x',
          role: 'student',
        },
      ])
      await tx.insert(grievances).values({
        id: grievanceId,
        institutionId: instA,
        reference: 'IDOR-TEST-0001',
        submittedById: filingStudent,
        subject: 'test grievance',
        body: 'body',
      })
      await tx.insert(attachments).values({
        id: attachmentId,
        institutionId: instA,
        grievanceId,
        uploadedById: filingStudent,
        storageKey: 'a'.repeat(48),
        fileName: 'evidence.pdf',
        contentType: 'application/pdf',
        byteSize: 10,
        sha256: 'b'.repeat(64),
      })
    })
  })

  afterAll(async () => {
    // Cascades take grievances/attachments/users with them.
    await withoutTenantScope('integration test teardown', async (tx) => {
      await tx.delete(institutions).where(inArray(institutions.id, [instA, instB]))
    })
    await pool.end()
  })

  it('lets the filing student fetch their own attachment', async () => {
    const actor: Actor = { id: filingStudent, role: 'student', institutionId: instA }
    const result = await loadAuthorizedAttachment(actor, attachmentId)
    expect(result?.id).toBe(attachmentId)
  })

  it('denies a student from the same institution who did not file it', async () => {
    const actor: Actor = { id: otherStudentSameInstitution, role: 'student', institutionId: instA }
    expect(await loadAuthorizedAttachment(actor, attachmentId)).toBeNull()
  })

  it('denies a user from a different institution entirely', async () => {
    // The cross-tenant IDOR: same attachment id, guessed or brute-forced, from a user
    // who was never in the room — RLS and canView both have to hold for this to fail.
    const actor: Actor = { id: studentAnotherInstitution, role: 'student', institutionId: instB }
    expect(await loadAuthorizedAttachment(actor, attachmentId)).toBeNull()
  })

  it('returns null rather than throwing for an attachment id that does not exist', async () => {
    const actor: Actor = { id: filingStudent, role: 'student', institutionId: instA }
    expect(await loadAuthorizedAttachment(actor, randomUUID())).toBeNull()
  })
})
