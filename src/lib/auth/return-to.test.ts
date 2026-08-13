import { describe, expect, it } from 'vitest'
import { isSafeReturnTo } from './return-to'

describe('isSafeReturnTo', () => {
  it('accepts an ordinary relative path', () => {
    expect(isSafeReturnTo('/grievances/123')).toBe(true)
    expect(isSafeReturnTo('/')).toBe(true)
    expect(isSafeReturnTo('/dashboard?tab=open')).toBe(true)
  })

  it('rejects a protocol-relative redirect', () => {
    // Browsers treat "//evil.com" as "https://evil.com" when used as a redirect target.
    expect(isSafeReturnTo('//evil.com')).toBe(false)
    expect(isSafeReturnTo('//evil.com/login')).toBe(false)
  })

  it('rejects the backslash variant some browsers also normalise to protocol-relative', () => {
    expect(isSafeReturnTo('/\\evil.com')).toBe(false)
  })

  it('rejects an absolute URL to another origin', () => {
    expect(isSafeReturnTo('https://evil.com')).toBe(false)
    expect(isSafeReturnTo('http://evil.com/login')).toBe(false)
  })

  it('rejects a scheme smuggled into the path or query', () => {
    expect(isSafeReturnTo('/redirect?u=https://evil.com')).toBe(false)
  })

  it('rejects empty, null and undefined', () => {
    expect(isSafeReturnTo('')).toBe(false)
    expect(isSafeReturnTo(null)).toBe(false)
    expect(isSafeReturnTo(undefined)).toBe(false)
  })

  it('rejects a path that does not start with a slash', () => {
    expect(isSafeReturnTo('evil.com')).toBe(false)
    expect(isSafeReturnTo('login')).toBe(false)
  })
})
