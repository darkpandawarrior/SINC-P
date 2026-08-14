/**
 * Local-disk attachment storage.
 *
 * The 2019 code did `move_uploaded_file($_FILES[...], "complaintdocs/".$name)` into a
 * web-served directory — upload a `.php` file, then GET it, and it runs as the server.
 * Everything here exists to make that class of bug impossible:
 *
 *   - files live under STORAGE_DIR, outside the web root, under an opaque random key
 *   - the type stored is whatever the BYTES are, never the client's declared
 *     Content-Type or filename extension
 *   - the size cap is enforced while streaming, so a 2GB upload never becomes 2GB of RSS
 *   - a SHA-256 travels with the file so a swapped file on disk is detectable
 *
 * S3 driver later: same put/get/delete surface, no abstraction built for it yet.
 */
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? './storage')

// Number(undefined) is NaN, and `NaN ?? x` never falls through (NaN is not
// null/undefined) — so a malformed env var would otherwise disable the cap by making
// every `total > cap` comparison false. Guard it explicitly.
// Exported so a form can state the real cap rather than a copy-pasted literal that
// drifts from STORAGE_MAX_BYTES the day someone changes the env var.
export const MAX_BYTES = (() => {
  const n = Number(process.env.STORAGE_MAX_BYTES)
  return Number.isFinite(n) && n > 0 ? n : 10 * 1024 * 1024
})()

export type AllowedType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain'

export interface PutResult {
  storageKey: string
  contentType: AllowedType
  byteSize: number
  sha256: string
}

export interface GetResult {
  stream: ReadStream
  byteSize: number
}

export class StorageError extends Error {
  constructor(
    public readonly code: 'too-large' | 'bad-type' | 'not-found' | 'bad-key',
    message: string,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

// Enough bytes to decide every allowed type. WEBP's signature ("RIFF"+size+"WEBP")
// needs the first 12; the rest is headroom for the plain-text heuristic below.
const SNIFF_BYTES = 512

/**
 * Ground truth is the bytes, never the declared Content-Type or the extension. Returns
 * null for anything that isn't one of the five allowed types, including a file that is
 * itself a legitimate format we simply don't accept (zip, exe, script, ...).
 */
function sniff(head: Buffer): AllowedType | null {
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'

  if (
    head.length >= 8 &&
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }

  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'

  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp'
  }

  // No binary signature matched. Plain text has no magic number, so fall back to "does
  // this look like text": no NUL byte, and it decodes as valid UTF-8. `head` may be a
  // prefix truncated mid multi-byte sequence when a text file is exactly at the sniff
  // boundary — fatal decode then false-rejects it as not-text, which is the safe
  // direction (we never falsely *accept* something as text).
  if (head.length === 0 || head.includes(0)) return null
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head)
    return 'text/plain'
  } catch {
    return null
  }
}

const KEY_RE = /^[a-f0-9]{48}$/

function resolveKeyPath(key: string): string {
  if (!KEY_RE.test(key)) throw new StorageError('bad-key', 'malformed storage key')

  const resolved = path.resolve(STORAGE_DIR, key)
  // KEY_RE already forbids '/' and '.', so this should be unreachable — kept anyway
  // because a resolved path outside STORAGE_DIR must never be opened, full stop.
  if (resolved !== path.join(STORAGE_DIR, key) || path.dirname(resolved) !== STORAGE_DIR) {
    throw new StorageError('bad-key', 'storage key escapes STORAGE_DIR')
  }
  return resolved
}

/**
 * Stream `content` to disk under a fresh opaque key. Rejects before writing anything if
 * the sniffed type isn't allowed, or if it disagrees with `declaredContentType` (when a
 * caller passes one — e.g. the client's upload Content-Type header, trusted for nothing
 * except catching a lie). The size cap is checked chunk-by-chunk, both during the head
 * buffering and the rest of the stream, so an oversized upload is aborted long before
 * it is fully read.
 */
async function put(
  content: AsyncIterable<Uint8Array>,
  opts: { maxBytes?: number; declaredContentType?: string } = {},
): Promise<PutResult> {
  const cap = opts.maxBytes ?? MAX_BYTES
  const iterator = content[Symbol.asyncIterator]()

  const head: Buffer[] = []
  let headLen = 0
  let streamEnded = false
  while (headLen < SNIFF_BYTES) {
    const { value, done } = await iterator.next()
    if (done) {
      streamEnded = true
      break
    }
    const chunk = Buffer.from(value)
    headLen += chunk.length
    if (headLen > cap) throw new StorageError('too-large', `attachment exceeds ${cap} bytes`)
    head.push(chunk)
  }
  const headBuf = Buffer.concat(head, headLen)

  const detected = sniff(headBuf)
  if (!detected) throw new StorageError('bad-type', 'file content does not match an allowed type')
  if (opts.declaredContentType && opts.declaredContentType !== detected) {
    throw new StorageError(
      'bad-type',
      `declared type "${opts.declaredContentType}" does not match sniffed content ("${detected}")`,
    )
  }

  await mkdir(STORAGE_DIR, { recursive: true })
  const storageKey = randomBytes(24).toString('hex')
  const filePath = resolveKeyPath(storageKey)
  const hash = createHash('sha256')
  let total = 0

  async function* remainder() {
    yield headBuf
    if (!streamEnded) {
      for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
        yield Buffer.from(next.value)
      }
    }
  }

  // A Transform so the cap and the hash are enforced on every chunk `pipeline` moves,
  // with backpressure handled by the stdlib rather than by hand.
  const capAndHash = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length
      if (total > cap) {
        cb(new StorageError('too-large', `attachment exceeds ${cap} bytes`))
        return
      }
      hash.update(chunk)
      cb(null, chunk)
    },
  })

  try {
    // 'wx': fail loudly on a colliding key rather than silently overwrite. Odds of a
    // 192-bit random key colliding are not worth a retry loop.
    await pipeline(Readable.from(remainder()), capAndHash, createWriteStream(filePath, { flags: 'wx' }))
  } catch (err) {
    await rm(filePath, { force: true })
    throw err
  }

  return { storageKey, contentType: detected, byteSize: total, sha256: hash.digest('hex') }
}

async function get(storageKey: string): Promise<GetResult> {
  const filePath = resolveKeyPath(storageKey)
  const stats = await stat(filePath).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })
  if (!stats) throw new StorageError('not-found', 'attachment not found on disk')
  return { stream: createReadStream(filePath), byteSize: stats.size }
}

async function del(storageKey: string): Promise<void> {
  await rm(resolveKeyPath(storageKey), { force: true })
}

export const storage = { put, get, delete: del }
