import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, verifyPassword } from './password'

// scrypt at N=2^16 is deliberately slow. That is the point, but it means these tests
// need more than the default timeout.
const SLOW = 20_000

describe('password hashing', () => {
  it('round-trips', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  }, SLOW)

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery stapl', stored)).toBe(false)
  }, SLOW)

  it('salts, so identical passwords do not collide', async () => {
    // The 2019 code stored md5($password) unsalted, so two students with the same
    // password had byte-identical hashes and one rainbow table broke the whole table.
    const a = await hashPassword('the same password')
    const b = await hashPassword('the same password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('the same password', b)).toBe(true)
  }, SLOW)

  it('normalises unicode so the same typed password verifies', async () => {
    // U+00E9 vs e + U+0301 look identical and different keyboards produce different
    // ones. Without NFKC the user is locked out of their own account.
    const composed = 'passwordé-long-enough'
    const decomposed = 'passwordé-long-enough'
    const stored = await hashPassword(composed)
    expect(await verifyPassword(decomposed, stored)).toBe(true)
  }, SLOW)

  it('refuses short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/)
  })

  it('refuses absurdly long passwords', async () => {
    // Each attempt costs ~64MB of hashing, so an unbounded password is a cheap DoS.
    await expect(hashPassword('x'.repeat(2000))).rejects.toThrow(/at most 1024/)
  })

  it('returns false rather than throwing on a malformed stored hash', async () => {
    // A corrupt row must not become an auth bypass, and must not 500 in a way that
    // tells an attacker the account exists.
    for (const bad of ['', 'garbage', 'md5$abc', 'scrypt$1$2$3', 'scrypt$x$8$1$YQ==$Yg==']) {
      expect(await verifyPassword('whatever', bad)).toBe(false)
    }
  })

  it('refuses tampered parameters instead of allocating them', async () => {
    // N=2^30 would try to allocate hundreds of GB. A tampered row must not be able to
    // take the process down.
    const stored = `scrypt$${2 ** 30}$8$1$YQ==$Yg==`
    expect(await verifyPassword('whatever', stored)).toBe(false)
  })

  it('flags weaker stored parameters for rehash', async () => {
    expect(needsRehash('scrypt$16384$8$1$YQ==$Yg==')).toBe(true)
    expect(needsRehash('not-a-hash')).toBe(true)
    expect(needsRehash(await hashPassword('a current strength password'))).toBe(false)
  }, SLOW)
})
