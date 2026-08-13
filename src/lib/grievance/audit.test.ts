import { describe, expect, it } from 'vitest'
import { GENESIS_HASH, hashEvent, nextEvent, verifyChain, type ChainableEvent } from './audit'

const G = '11111111-2222-3333-4444-555555555555'
const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s))

function chain(count: number) {
  const events: Array<ChainableEvent & { hash: string }> = []
  let prev: { seq: number; hash: string } | null = null
  for (let i = 0; i < count; i++) {
    const e = nextEvent(prev, {
      grievanceId: G,
      type: i === 0 ? 'submitted' : 'remark_added',
      actorId: 'actor-1',
      remark: `remark ${i}`,
      payload: { i },
      createdAt: at(i),
    })
    events.push(e)
    prev = { seq: e.seq, hash: e.hash }
  }
  return events
}

describe('hash chain', () => {
  it('accepts an intact chain', () => {
    expect(verifyChain(chain(5))).toEqual({ ok: true, length: 5 })
  })

  it('starts from genesis at seq 1', () => {
    const [first] = chain(1)
    expect(first!.seq).toBe(1)
    expect(first!.prevHash).toBe(GENESIS_HASH)
  })

  it('detects a retro-edited remark', () => {
    const events = chain(4)
    // The exact attack the append-only trail exists to catch: an officer quietly
    // rewrites what they said three events ago.
    events[1]!.remark = 'something more flattering'
    expect(verifyChain(events)).toEqual({
      ok: false,
      brokenAtSeq: 2,
      reason: 'hash-mismatch',
    })
  })

  it('detects a deleted event', () => {
    const events = chain(4)
    events.splice(1, 1) // remove seq 2; seq 3 and 4 remain
    // The gap is caught before the hash check, since seq must be dense.
    expect(verifyChain(events)).toMatchObject({ ok: false, reason: 'seq-gap' })
  })

  it('detects a re-pointed prevHash', () => {
    const events = chain(3)
    events[2]!.prevHash = events[0]!.hash // try to orphan seq 2
    expect(verifyChain(events)).toEqual({
      ok: false,
      brokenAtSeq: 3,
      reason: 'prev-mismatch',
    })
  })

  it('is not fooled by field-boundary shifting', () => {
    // Without a separator between fields, ("ab","c") and ("a","bc") would serialise
    // identically. This is a forgery primitive, so it gets its own test.
    const base = {
      grievanceId: G,
      actorId: null,
      payload: null,
      createdAt: at(0),
      prevHash: GENESIS_HASH,
      seq: 1,
    }
    const a = hashEvent({ ...base, type: 'ab', remark: 'c' })
    const b = hashEvent({ ...base, type: 'a', remark: 'bc' })
    expect(a).not.toBe(b)
  })

  it('hashes payloads independently of key order', () => {
    const base = {
      grievanceId: G,
      type: 'status_changed',
      actorId: null,
      remark: null,
      createdAt: at(0),
      prevHash: GENESIS_HASH,
      seq: 1,
    }
    const a = hashEvent({ ...base, payload: { from: 'submitted', to: 'under_review' } })
    const b = hashEvent({ ...base, payload: { to: 'under_review', from: 'submitted' } })
    // Same event, different insertion order. If these differed, a chain would break
    // spuriously whenever an object was rebuilt in another order.
    expect(a).toBe(b)
  })

  it('treats an empty chain as valid', () => {
    expect(verifyChain([])).toEqual({ ok: true, length: 0 })
  })
})
