import { beforeEach, describe, expect, it } from 'vitest'
import { __resetRateLimitStateForTests, checkLoginRateLimit, checkResetRateLimit } from './ratelimit'

beforeEach(() => {
  __resetRateLimitStateForTests()
})

describe('checkLoginRateLimit', () => {
  it('allows attempts under the per-account limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkLoginRateLimit('1.2.3.4', 'student@example.edu')).toBe(true)
    }
  })

  it('blocks the account after 5 attempts even from different IPs', () => {
    for (let i = 0; i < 5; i++) checkLoginRateLimit(`1.2.3.${i}`, 'student@example.edu')
    expect(checkLoginRateLimit('9.9.9.9', 'student@example.edu')).toBe(false)
  })

  it('is case-insensitive on the account key', () => {
    for (let i = 0; i < 5; i++) checkLoginRateLimit('1.2.3.4', 'Student@Example.edu')
    expect(checkLoginRateLimit('1.2.3.4', 'student@example.edu')).toBe(false)
  })

  it('blocks one IP spraying many accounts once the IP ceiling is hit', () => {
    for (let i = 0; i < 30; i++) checkLoginRateLimit('1.2.3.4', `student${i}@example.edu`)
    expect(checkLoginRateLimit('1.2.3.4', 'student-new@example.edu')).toBe(false)
  })

  it('does not block an untouched account from an untouched IP', () => {
    checkLoginRateLimit('1.2.3.4', 'someone@example.edu')
    expect(checkLoginRateLimit('5.6.7.8', 'someone-else@example.edu')).toBe(true)
  })
})

describe('checkResetRateLimit', () => {
  it('has a separate budget from login for the same account', () => {
    for (let i = 0; i < 5; i++) checkLoginRateLimit('1.2.3.4', 'student@example.edu')
    expect(checkResetRateLimit('1.2.3.4', 'student@example.edu')).toBe(true)
  })

  it('blocks after the per-account reset ceiling', () => {
    for (let i = 0; i < 5; i++) checkResetRateLimit('1.2.3.4', 'student@example.edu')
    expect(checkResetRateLimit('1.2.3.4', 'student@example.edu')).toBe(false)
  })
})
