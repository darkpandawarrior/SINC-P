import { describe, expect, it } from 'vitest'
import { buildMessage, sanitiseHeader } from './transport'

describe('SMTP message construction', () => {
  it('dot-stuffs a line that would otherwise end the DATA command', () => {
    // A bare "." on its own line terminates DATA. Unescaped, a student pasting one into
    // a remark truncates the mail and everything after it is read as SMTP commands.
    const out = buildMessage('from@x.test', {
      to: 'to@x.test',
      subject: 'S',
      body: 'line one\n.\nRCPT TO:<attacker@evil.test>\nline two',
    })
    expect(out).toContain('\r\n..\r\n')
    // The injected command survives only as ordinary body text.
    expect(out).not.toMatch(/\r\n\.\r\nRCPT/)
  })

  it('dot-stuffs a leading dot without mangling the rest of the line', () => {
    const out = buildMessage('f@x.test', { to: 't@x.test', subject: 'S', body: '.hidden' })
    expect(out).toContain('\r\n\r\n..hidden\r\n.')
  })

  it('terminates with a lone dot', () => {
    const out = buildMessage('f@x.test', { to: 't@x.test', subject: 'S', body: 'plain' })
    expect(out.endsWith('\r\nplain\r\n.')).toBe(true)
  })

  it('uses CRLF line endings throughout', () => {
    const out = buildMessage('f@x.test', { to: 't@x.test', subject: 'S', body: 'a\nb' })
    expect(out).not.toMatch(/[^\r]\n/)
  })

  it('strips CR and LF from a header value', () => {
    // Header injection: a newline in a subject lets it append its own headers.
    expect(sanitiseHeader('Hi\r\nBcc: attacker@evil.test')).toBe('Hi Bcc: attacker@evil.test')
    expect(sanitiseHeader('a\nb\r\nc')).toBe('a b c')
  })

  it('caps an absurdly long header', () => {
    expect(sanitiseHeader('x'.repeat(5000)).length).toBe(900)
  })

  it('keeps a subject with an injected newline out of the header block', () => {
    const out = buildMessage('f@x.test', {
      to: 't@x.test',
      subject: 'Overdue\r\nBcc: attacker@evil.test',
      body: 'b',
    })
    const headerLines = out.split('\r\n\r\n')[0]!.split('\r\n')
    // The injected text survives as part of the Subject *value*, which is harmless.
    // What must not happen is it becoming a header line of its own.
    expect(headerLines.some((l) => l.startsWith('Bcc:'))).toBe(false)
    expect(headerLines.filter((l) => l.startsWith('Subject:'))).toHaveLength(1)
    expect(headerLines.find((l) => l.startsWith('Subject:'))).toContain('Bcc: attacker@evil.test')
  })
})
