import { describe, expect, it } from 'vitest'
import { generateCsrfToken, tokensMatch } from './csrf'

describe('tokensMatch', () => {
  it('accepts a matching cookie and submitted value', () => {
    const token = generateCsrfToken()
    expect(tokensMatch(token, token)).toBe(true)
  })

  it('rejects a missing cookie', () => {
    const token = generateCsrfToken()
    expect(tokensMatch(undefined, token)).toBe(false)
  })

  it('rejects a missing submitted field', () => {
    const token = generateCsrfToken()
    expect(tokensMatch(token, null)).toBe(false)
  })

  it('rejects a submitted value from a different token (forged/stale form)', () => {
    const a = generateCsrfToken()
    const b = generateCsrfToken()
    expect(tokensMatch(a, b)).toBe(false)
  })

  it('rejects a File submitted where a string was expected', () => {
    const token = generateCsrfToken()
    const file = new File(['x'], 'x.txt')
    expect(tokensMatch(token, file)).toBe(false)
  })

  it('rejects an empty submitted string', () => {
    const token = generateCsrfToken()
    expect(tokensMatch(token, '')).toBe(false)
  })
})

describe('generateCsrfToken', () => {
  it('produces distinct, reasonably long tokens', () => {
    const a = generateCsrfToken()
    const b = generateCsrfToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
  })
})
