import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('escapes raw HTML instead of passing it through', () => {
    const out = renderMarkdown('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('renders a heading', () => {
    expect(renderMarkdown('## Hostel maintenance')).toBe('<h2>Hostel maintenance</h2>')
  })

  it('renders bold, italic and inline code', () => {
    const out = renderMarkdown('**bold** and *italic* and `code`')
    expect(out).toBe('<p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>')
  })

  it('renders a safe link but drops a javascript: URI', () => {
    expect(renderMarkdown('[click](https://example.edu)')).toContain(
      '<a href="https://example.edu" rel="noopener noreferrer" target="_blank">click</a>',
    )
    expect(renderMarkdown('[click](javascript:alert(1))')).toContain('href="#"')
    expect(renderMarkdown('[click](javascript:alert(1))')).not.toContain('javascript:')
  })

  it('renders an unordered list', () => {
    expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('renders an ordered list', () => {
    expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  it('renders a blockquote', () => {
    expect(renderMarkdown('> quoted line')).toBe('<blockquote><p>quoted line</p></blockquote>')
  })

  it('joins paragraph blocks separated by a blank line', () => {
    expect(renderMarkdown('first\n\nsecond')).toBe('<p>first</p>\n<p>second</p>')
  })

  it('returns empty string for empty input', () => {
    expect(renderMarkdown('   \n  ')).toBe('')
  })

  it('an attribute-breakout attempt inside a link label is escaped, not executed', () => {
    const out = renderMarkdown('[" onmouseover="alert(1)](https://example.edu)')
    expect(out).not.toContain('onmouseover="alert(1)"')
    expect(out).toContain('&quot; onmouseover=&quot;alert(1)')
  })
})
