import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRateLimitStateForTests,
  __stores,
  checkLoginRateLimit,
  checkResetRateLimit,
} from './ratelimit'
import { dbAvailable } from '@/test/db'

beforeEach(async () => {
  await __resetRateLimitStateForTests()
})

describe('checkLoginRateLimit', () => {
  it('allows attempts under the per-account limit', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await checkLoginRateLimit('1.2.3.4', 'student@example.edu')).toBe(true)
    }
  })

  it('blocks the account after 5 attempts even from different IPs', async () => {
    for (let i = 0; i < 5; i++) await checkLoginRateLimit(`1.2.3.${i}`, 'student@example.edu')
    expect(await checkLoginRateLimit('9.9.9.9', 'student@example.edu')).toBe(false)
  })

  it('is case-insensitive on the account key', async () => {
    for (let i = 0; i < 5; i++) await checkLoginRateLimit('1.2.3.4', 'Student@Example.edu')
    expect(await checkLoginRateLimit('1.2.3.4', 'student@example.edu')).toBe(false)
  })

  it('blocks one IP spraying many accounts once the IP ceiling is hit', async () => {
    for (let i = 0; i < 30; i++) await checkLoginRateLimit('1.2.3.4', `student${i}@example.edu`)
    expect(await checkLoginRateLimit('1.2.3.4', 'student-new@example.edu')).toBe(false)
  })

  it('does not block an untouched account from an untouched IP', async () => {
    await checkLoginRateLimit('1.2.3.4', 'someone@example.edu')
    expect(await checkLoginRateLimit('5.6.7.8', 'someone-else@example.edu')).toBe(true)
  })
})

describe('checkResetRateLimit', () => {
  it('has a separate budget from login for the same account', async () => {
    for (let i = 0; i < 5; i++) await checkLoginRateLimit('1.2.3.4', 'student@example.edu')
    expect(await checkResetRateLimit('1.2.3.4', 'student@example.edu')).toBe(true)
  })

  it('blocks after the per-account reset ceiling', async () => {
    for (let i = 0; i < 5; i++) await checkResetRateLimit('1.2.3.4', 'student@example.edu')
    expect(await checkResetRateLimit('1.2.3.4', 'student@example.edu')).toBe(false)
  })
})

describe('the postgres store', () => {
  // The shared store is what makes limiting correct behind a load balancer: without it,
  // round-robining two app instances doubles an attacker's attempt budget.
  const store = __stores.postgresStore()

  beforeEach(async () => {
    if (dbAvailable) await store.reset()
  })

  it.skipIf(!dbAvailable)('counts across independent calls, like separate instances would', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await store.hit('login:acct:shared@example.edu', 3, 60_000)).toBe(true)
    }
    // A fourth attempt from "another instance" sees the same counter.
    expect(await store.hit('login:acct:shared@example.edu', 3, 60_000)).toBe(false)
  })

  it.skipIf(!dbAvailable)('starts a fresh window once the old one expires', async () => {
    // A zero-length window is already expired by the time the next call lands.
    expect(await store.hit('login:acct:expiring@example.edu', 1, 0)).toBe(true)
    expect(await store.hit('login:acct:expiring@example.edu', 1, 0)).toBe(true)
  })

  it.skipIf(!dbAvailable)('keeps separate keys separate', async () => {
    expect(await store.hit('a', 1, 60_000)).toBe(true)
    expect(await store.hit('a', 1, 60_000)).toBe(false)
    expect(await store.hit('b', 1, 60_000)).toBe(true)
  })

  it.skipIf(!dbAvailable)('counts concurrent hits on one key exactly once each', async () => {
    // Ten simultaneous requests must consume ten of the budget, not one. A read-then-
    // write implementation would let most of them see the same stale count.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.hit('race@example.edu', 4, 60_000)),
    )
    expect(results.filter(Boolean)).toHaveLength(4)
  })
})
