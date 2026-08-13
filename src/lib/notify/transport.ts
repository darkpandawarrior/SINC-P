/**
 * How a queued message actually leaves the building.
 *
 * Two drivers ship: `log` (writes to stdout, the default in development) and `smtp`
 * (talks to a real server). SMTP is spoken directly over a TCP socket from `node:net`
 * and `node:tls` rather than pulling in nodemailer, because what this needs is one
 * plaintext message to one recipient over a college's own relay, and that is roughly
 * eighty lines. A dependency here would be four hundred kilobytes to avoid writing
 * `MAIL FROM`.
 *
 * If a customer ever needs DKIM signing, attachments, or a provider API, this is the
 * seam to replace, and the outbox above will not notice.
 */
import { createConnection, type Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

export interface Message {
  to: string
  subject: string
  body: string
}

export interface Transport {
  name: string
  send(message: Message): Promise<void>
}

const logTransport: Transport = {
  name: 'log',
  async send(message) {
    // Deliberately one line per message so a dev tail stays readable.
    console.log(`[notify:log] to=${message.to} subject=${JSON.stringify(message.subject)}`)
  },
}

class SmtpError extends Error {}

/**
 * The smallest SMTP client that is still correct for this use case.
 *
 * Handles the greeting, optional STARTTLS, optional AUTH LOGIN, one recipient, and
 * QUIT. It does not pipeline, does not do CRAM-MD5, and does not pretend to be a
 * general mail library.
 */
function smtpTransport(): Transport {
  const host = requiredEnv('SMTP_HOST')
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = requiredEnv('SMTP_FROM')
  const useTls = process.env.SMTP_TLS === 'implicit'

  return {
    name: `smtp:${host}:${port}`,
    async send(message) {
      const socket: Socket = useTls
        ? (tlsConnect({ host, port, servername: host }) as unknown as Socket)
        : createConnection({ host, port })

      const conn = new SmtpConnection(socket)
      try {
        await conn.expect(220)
        await conn.cmd(`EHLO ${hostnameForGreeting()}`, 250)

        if (!useTls && process.env.SMTP_TLS !== 'off') {
          await conn.cmd('STARTTLS', 220)
          await conn.upgradeToTls(host)
          await conn.cmd(`EHLO ${hostnameForGreeting()}`, 250)
        }

        if (user && pass) {
          await conn.cmd('AUTH LOGIN', 334)
          await conn.cmd(Buffer.from(user).toString('base64'), 334)
          await conn.cmd(Buffer.from(pass).toString('base64'), 235)
        }

        await conn.cmd(`MAIL FROM:<${from}>`, 250)
        await conn.cmd(`RCPT TO:<${message.to}>`, 250)
        await conn.cmd('DATA', 354)
        await conn.cmd(buildMessage(from, message), 250)
        await conn.cmd('QUIT', 221).catch(() => {})
      } finally {
        conn.destroy()
      }
    },
  }
}

/**
 * Dot-stuffing is not optional. A body line that is a single "." terminates the DATA
 * command, so an unescaped one truncates the mail and, on a hostile input, lets the
 * sender inject SMTP commands.
 */
export function buildMessage(from: string, message: Message): string {
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${sanitiseHeader(message.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    `Date: ${new Date().toUTCString()}`,
  ].join('\r\n')

  const body = message.body
    .split(/\r?\n/)
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n')

  return `${headers}\r\n\r\n${body}\r\n.`
}

/** CR and LF in a header value is header injection: it lets a subject add a Bcc. */
export function sanitiseHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, 900)
}

function hostnameForGreeting(): string {
  return process.env.SMTP_EHLO_NAME ?? 'sincp.local'
}

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new SmtpError(`${name} is required when NOTIFY_TRANSPORT=smtp`)
  return v
}

class SmtpConnection {
  private buffer = ''
  private waiter: ((chunk: string) => void) | null = null

  constructor(private socket: Socket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      this.buffer += chunk
      this.drain()
    })
  }

  private drain() {
    if (!this.waiter) return
    // A complete SMTP reply ends with "NNN " (space, not hyphen) on its last line.
    const match = this.buffer.match(/^\d{3} [^\r\n]*\r?\n/m)
    if (!match) return
    const reply = this.buffer
    this.buffer = ''
    const w = this.waiter
    this.waiter = null
    w(reply)
  }

  private read(timeoutMs = 15_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new SmtpError('SMTP read timed out')), timeoutMs)
      this.waiter = (chunk) => {
        clearTimeout(timer)
        resolve(chunk)
      }
      this.drain()
    })
  }

  async expect(code: number): Promise<string> {
    const reply = await this.read()
    const got = Number(reply.slice(0, 3))
    if (got !== code) throw new SmtpError(`expected ${code}, got: ${reply.trim().slice(0, 200)}`)
    return reply
  }

  async cmd(line: string, expect: number): Promise<string> {
    this.socket.write(`${line}\r\n`)
    return this.expect(expect)
  }

  async upgradeToTls(host: string): Promise<void> {
    const plain = this.socket
    plain.removeAllListeners('data')
    this.socket = tlsConnect({ socket: plain, servername: host }) as unknown as Socket
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk
      this.drain()
    })
    await new Promise((resolve, reject) => {
      this.socket.once('secureConnect' as never, resolve as never)
      this.socket.once('error', reject)
    })
  }

  destroy() {
    this.socket.destroy()
  }
}

let cached: Transport | undefined

/** `log` by default. A misconfigured production deployment fails loudly at first send
 *  rather than silently dropping every message into stdout. */
export function getTransport(): Transport {
  if (cached) return cached
  const driver = process.env.NOTIFY_TRANSPORT ?? 'log'
  cached = driver === 'smtp' ? smtpTransport() : logTransport
  return cached
}

/** Tests replace the transport rather than opening sockets. */
export function __setTransportForTests(t: Transport | undefined) {
  cached = t
}
