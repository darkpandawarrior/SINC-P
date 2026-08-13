import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { dbAvailable } from '@/test/db'
import { pool, withTenant, withoutTenantScope } from '@/db/client'
import { institutions, notifications, users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { enqueue, claimBatch, markFailed, markSent, outboxStats, MAX_ATTEMPTS } from './outbox'
import { sweep } from './sender'
import { __setTransportForTests, type Transport } from './transport'

const SLUG_A = `notify-a-${Date.now()}`
const SLUG_B = `notify-b-${Date.now()}`

describe.skipIf(!dbAvailable)('notification outbox', () => {
  let instA = ''
  let instB = ''
  let userA = ''

  beforeAll(async () => {
    const hash = await hashPassword('outbox-test-password')
    await withoutTenantScope('test fixture', async (tx) => {
      const [a] = await tx.insert(institutions).values({ slug: SLUG_A, name: 'A College' }).returning()
      const [b] = await tx.insert(institutions).values({ slug: SLUG_B, name: 'B College' }).returning()
      instA = a!.id
      instB = b!.id
      const [u] = await tx
        .insert(users)
        .values({
          institutionId: instA,
          email: `student@${SLUG_A}.test`,
          fullName: 'A Student',
          passwordHash: hash,
        })
        .returning()
      userA = u!.id
    })
  })

  afterAll(async () => {
    await withoutTenantScope('test teardown', async (tx) => {
      for (const id of [instA, instB]) {
        if (id) await tx.delete(institutions).where(eq(institutions.id, id))
      }
    })
    __setTransportForTests(undefined)
    await pool.end()
  })

  it('queues a message inside the caller transaction', async () => {
    await withTenant(instA, (tx) =>
      enqueue(tx, {
        institutionId: instA,
        recipientUserId: userA,
        recipientEmail: 'Student@Example.TEST',
        kind: 'grievance_submitted',
        subject: 'Received',
        body: 'Your grievance was received.',
      }),
    )

    const rows = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.institutionId, instA)),
    )
    expect(rows).toHaveLength(1)
    // Addresses are normalised so a dedupe or a bounce list cannot be defeated by case.
    expect(rows[0]!.recipientEmail).toBe('student@example.test')
    expect(rows[0]!.status).toBe('pending')
  })

  it('rolls the message back when the surrounding transaction fails', async () => {
    // This is the whole reason enqueue takes a tx. If a grievance write fails after the
    // message is queued, nobody should be told about a thing that did not happen.
    await expect(
      withTenant(instA, async (tx) => {
        await enqueue(tx, {
          institutionId: instA,
          recipientEmail: 'ghost@example.test',
          kind: 'status_changed',
          subject: 'Should never send',
          body: 'This transaction is about to fail.',
        })
        throw new Error('simulated failure after enqueue')
      }),
    ).rejects.toThrow('simulated failure')

    const ghost = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.recipientEmail, 'ghost@example.test')),
    )
    expect(ghost).toHaveLength(0)
  })

  it('dedupes on dedupeKey instead of raising', async () => {
    const send = () =>
      withTenant(instA, (tx) =>
        enqueue(tx, {
          institutionId: instA,
          recipientEmail: 'dupe@example.test',
          kind: 'sla_breached',
          subject: 'Overdue',
          body: 'Overdue.',
          dedupeKey: 'sla_breached:fixed-key',
        }),
      )

    await send()
    // A second identical enqueue must be a silent no-op. If it threw, a retried
    // escalation sweep would roll back whatever transaction it was riding in.
    await expect(send()).resolves.toBeUndefined()

    const rows = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.dedupeKey, 'sla_breached:fixed-key')),
    )
    expect(rows).toHaveLength(1)
  })

  it('lets the same dedupeKey exist in a different institution', async () => {
    await withTenant(instB, (tx) =>
      enqueue(tx, {
        institutionId: instB,
        recipientEmail: 'other@example.test',
        kind: 'sla_breached',
        subject: 'Overdue',
        body: 'Overdue.',
        dedupeKey: 'sla_breached:fixed-key',
      }),
    )
    const rows = await withTenant(instB, (tx) =>
      tx.select().from(notifications).where(eq(notifications.institutionId, instB)),
    )
    expect(rows).toHaveLength(1)
  })

  it('sweeps pending messages through the transport and marks them sent', async () => {
    const seen: string[] = []
    const fake: Transport = {
      name: 'test',
      async send(m) {
        seen.push(m.to)
      },
    }
    __setTransportForTests(fake)

    const result = await sweep(100)
    expect(result.claimed).toBeGreaterThan(0)
    expect(result.sent).toBe(result.claimed)
    expect(seen.length).toBe(result.claimed)

    const stats = await outboxStats(instA)
    expect(stats.pending).toBe(0)
    expect(stats.sent).toBeGreaterThan(0)
  })

  it('records the error and retries a failing message up to a limit', async () => {
    __setTransportForTests({
      name: 'broken',
      async send() {
        throw new Error('relay refused')
      },
    })

    await withTenant(instA, (tx) =>
      enqueue(tx, {
        institutionId: instA,
        recipientEmail: 'fails@example.test',
        kind: 'status_changed',
        subject: 'Will fail',
        body: 'Will fail.',
      }),
    )

    for (let i = 0; i < MAX_ATTEMPTS; i++) await sweep(100)

    const [row] = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.recipientEmail, 'fails@example.test')),
    )
    expect(row!.status).toBe('failed')
    expect(row!.lastError).toContain('relay refused')
    // Stops retrying rather than hammering a dead relay forever.
    expect(row!.attempts).toBe(MAX_ATTEMPTS)

    const after = await claimBatch(100)
    expect(after.some((r) => r.recipientEmail === 'fails@example.test')).toBe(false)
  })

  it('marks sent and failed idempotently', async () => {
    const [row] = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.institutionId, instA)).limit(1),
    )
    await markSent(row!.id)
    await markSent(row!.id)
    await markFailed(row!.id, 'x')
    const [again] = await withTenant(instA, (tx) =>
      tx.select().from(notifications).where(eq(notifications.id, row!.id)),
    )
    expect(again!.status).toBe('failed')
  })
})
