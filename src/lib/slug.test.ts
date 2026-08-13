import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hostel Water Supply Issue')).toBe('hostel-water-supply-issue')
  })

  it('strips accents', () => {
    expect(slugify('Café Renovation')).toBe('cafe-renovation')
  })

  it('collapses punctuation into single hyphens and trims edges', () => {
    expect(slugify('  Fee & Refund?! ')).toBe('fee-refund')
  })

  it('falls back to "untitled" when nothing alphanumeric survives', () => {
    expect(slugify('!!!')).toBe('untitled')
  })
})
