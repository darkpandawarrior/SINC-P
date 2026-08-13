/**
 * The tamper-evident grievance trail.
 *
 * Every event is hash-chained to its predecessor:
 *
 *     hash(n) = sha256( prevHash | grievanceId | seq | type | actorId | remark | payload | createdAt )
 *
 * Editing or deleting any historical row changes that row's hash, which breaks every
 * hash after it. `verifyChain` finds the first break and names it.
 *
 * Deliberate wording, per the council's caveat: this makes tampering **evident**, not
 * impossible. A determined administrator with database access can rewrite the whole
 * chain. What this buys is that they cannot rewrite *part* of it — a retro-edited remark
 * or a deleted escalation shows up as a broken link, which is exactly the question an
 * auditor is asking. Backup retention and restricted database roles carry the rest.
 */
import { createHash } from 'node:crypto'

export interface ChainableEvent {
  grievanceId: string
  seq: number
  type: string
  actorId: string | null
  remark: string | null
  payload: Record<string, unknown> | null
  createdAt: Date
  prevHash: string | null
}

/** Genesis value for seq 1. Distinguishes "chain starts here" from "prevHash lost". */
export const GENESIS_HASH = '0'.repeat(64)

/**
 * Canonical serialisation. This must be byte-stable forever — change it and every
 * existing chain fails to verify, so it is versioned by the `v1` prefix. A future
 * change adds `v2` and verification tries the version the row was written with.
 */
function canonical(e: ChainableEvent): string {
  return [
    'v1',
    e.prevHash ?? GENESIS_HASH,
    e.grievanceId,
    String(e.seq),
    e.type,
    e.actorId ?? '',
    e.remark ?? '',
    // Sorted keys: JSON.stringify key order follows insertion order, so two
    // semantically identical payloads could otherwise hash differently.
    e.payload ? stableStringify(e.payload) : '',
    e.createdAt.toISOString(),
  ].join('\x1f') // unit separator — cannot occur in any of the fields above
}

export function hashEvent(e: ChainableEvent): string {
  return createHash('sha256').update(canonical(e), 'utf8').digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}

export type ChainVerdict =
  | { ok: true; length: number }
  | { ok: false; brokenAtSeq: number; reason: 'hash-mismatch' | 'prev-mismatch' | 'seq-gap' }

/**
 * Verify a grievance's full event chain. Events must be passed in ascending `seq`.
 *
 * Returns the *first* break rather than throwing, because the compliance export needs
 * to render a partial trail with the break marked rather than fail closed.
 */
export function verifyChain(events: Array<ChainableEvent & { hash: string }>): ChainVerdict {
  let expectedPrev: string | null = null

  for (const [i, event] of events.entries()) {
    const expectedSeq = i + 1
    if (event.seq !== expectedSeq) {
      return { ok: false, brokenAtSeq: event.seq, reason: 'seq-gap' }
    }

    // seq 1 may store null or GENESIS; anything later must match its predecessor.
    const prevOk =
      i === 0
        ? event.prevHash === null || event.prevHash === GENESIS_HASH
        : event.prevHash === expectedPrev
    if (!prevOk) {
      return { ok: false, brokenAtSeq: event.seq, reason: 'prev-mismatch' }
    }

    if (hashEvent(event) !== event.hash) {
      return { ok: false, brokenAtSeq: event.seq, reason: 'hash-mismatch' }
    }
    expectedPrev = event.hash
  }

  return { ok: true, length: events.length }
}

/** Build the next link. The caller inserts it inside the same transaction that read
 *  `previous`, so two concurrent events cannot both claim the same seq — the
 *  `(grievance_id, seq)` unique index turns that race into a retryable error. */
export function nextEvent(
  previous: { seq: number; hash: string } | null,
  draft: Omit<ChainableEvent, 'seq' | 'prevHash'>,
): ChainableEvent & { hash: string } {
  const event: ChainableEvent = {
    ...draft,
    seq: previous ? previous.seq + 1 : 1,
    prevHash: previous ? previous.hash : GENESIS_HASH,
  }
  return { ...event, hash: hashEvent(event) }
}
