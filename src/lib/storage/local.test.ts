import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let storage: typeof import('./local').storage
let dir: string

// The module reads STORAGE_DIR/STORAGE_MAX_BYTES once at import time, so the env vars
// have to be set before the dynamic import — a static top-level import would run before
// this file's beforeAll ever executes.
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'sincp-storage-'))
  process.env.STORAGE_DIR = dir
  process.env.STORAGE_MAX_BYTES = '1048576'
  ;({ storage } = await import('./local'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function* fromBuffer(buf: Buffer, chunkSize = 64 * 1024) {
  for (let i = 0; i < buf.length; i += chunkSize) yield buf.subarray(i, i + chunkSize)
}

const PDF_HEADER = Buffer.from('%PDF-1.7\n%some fake but header-valid pdf body\n')

describe('put: allowed types, decided from bytes', () => {
  const cases: Array<[string, Buffer]> = [
    ['application/pdf', PDF_HEADER],
    [
      'image/png',
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]),
    ],
    ['image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)])],
    [
      'image/webp',
      Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(8)]),
    ],
    ['text/plain', Buffer.from('a plain text attachment, no magic bytes at all')],
  ]

  it.each(cases)('accepts %s', async (expected, buf) => {
    const result = await storage.put(fromBuffer(buf))
    expect(result.contentType).toBe(expected)
  })
})

describe('put: magic-byte rejection', () => {
  it('rejects content whose bytes match none of the allowed types', async () => {
    // ELF header — the executable-upload attack the 2019 bug enabled, under any name.
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(20)])
    await expect(storage.put(fromBuffer(elf))).rejects.toMatchObject({ code: 'bad-type' })
  })

  it('rejects when the declared type disagrees with the sniffed bytes', async () => {
    // Exactly the 2019-era lie: a client-supplied Content-Type that does not match what
    // the file actually is. Bytes win.
    const text = Buffer.from('just a text file pretending to be a pdf')
    await expect(
      storage.put(fromBuffer(text), { declaredContentType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'bad-type' })
  })

  it('leaves no partial file behind on rejection', async () => {
    const before = await readdir(dir)
    const bad = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(30)]) // MZ, a PE header
    await expect(storage.put(fromBuffer(bad))).rejects.toThrow()
    expect(await readdir(dir)).toHaveLength(before.length)
  })
})

describe('put: size cap enforced while streaming', () => {
  it('aborts an oversized upload without reading it all', async () => {
    const cap = 1024
    let pulled = 0
    async function* oversized() {
      // 400 chunks x 10 bytes = 4000 bytes, 4x the cap. A correct implementation stops
      // long before exhausting the generator — that's what `pulled` proves.
      for (let i = 0; i < 400; i++) {
        pulled++
        yield PDF_HEADER.subarray(0, 10)
      }
    }
    await expect(storage.put(oversized(), { maxBytes: cap })).rejects.toMatchObject({
      code: 'too-large',
    })
    expect(pulled).toBeLessThan(400)
  })
})

describe('get/delete: path traversal', () => {
  it('refuses a relative traversal key', async () => {
    await expect(storage.get('../../../../etc/passwd')).rejects.toMatchObject({ code: 'bad-key' })
  })

  it('refuses an absolute-path key', async () => {
    await expect(storage.get('/etc/passwd')).rejects.toMatchObject({ code: 'bad-key' })
  })

  it('refuses a key with an embedded separator, however it is encoded', async () => {
    await expect(storage.get('a'.repeat(24) + '/../../x')).rejects.toMatchObject({ code: 'bad-key' })
  })

  it('round-trips a real file and the key stays a valid SHA verification', async () => {
    const { storageKey, sha256 } = await storage.put(fromBuffer(PDF_HEADER))
    const got = await storage.get(storageKey)
    const chunks: Buffer[] = []
    for await (const chunk of got.stream) chunks.push(chunk as Buffer)
    const content = Buffer.concat(chunks)
    expect(content.equals(PDF_HEADER)).toBe(true)
    expect(createHash('sha256').update(content).digest('hex')).toBe(sha256)

    await storage.delete(storageKey)
    await expect(storage.get(storageKey)).rejects.toMatchObject({ code: 'not-found' })
  })
})
