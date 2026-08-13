/**
 * Password hashing.
 *
 * scrypt from node:crypto — no dependency, memory-hard, and in the standard library,
 * so there is nothing to keep patched. The 2019 code stored `md5($_POST['password'])`
 * unsalted: every user of that database could be reversed with a rainbow table in
 * seconds, and identical passwords produced identical hashes.
 *
 * Format: `scrypt$N$r$p$saltB64$hashB64`. The parameters travel with the hash so they
 * can be raised later without invalidating existing rows — `needsRehash` tells the
 * login path when to transparently upgrade one.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** ~64 MB per hash. Raise N when hardware makes it cheap; the format carries it. */
const PARAMS = { N: 2 ** 16, r: 8, p: 1 } as const
const KEYLEN = 64
const SALT_BYTES = 16
// scrypt needs roughly 128 * N * r bytes; the default 32MB cap rejects N=65536.
const maxmemFor = (N: number, r: number) => 256 * N * r

export async function hashPassword(password: string): Promise<string> {
  assertPasswordShape(password)
  const salt = randomBytes(SALT_BYTES)
  const { N, r, p } = PARAMS
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: maxmemFor(N, r),
  })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

/**
 * Constant-time verification. Returns false rather than throwing on a malformed
 * stored hash — a corrupt row must not become an authentication bypass, and must not
 * become a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored)
  if (!parsed) return false

  const { N, r, p, salt, hash } = parsed
  let derived: Buffer
  try {
    derived = await scrypt(password.normalize('NFKC'), salt, hash.length, {
      N,
      r,
      p,
      maxmem: maxmemFor(N, r),
    })
  } catch {
    return false
  }
  return derived.length === hash.length && timingSafeEqual(derived, hash)
}

/** True when `stored` was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored)
  if (!parsed) return true
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p
}

function parse(stored: string) {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null
  // Refuse absurd parameters from a tampered row rather than letting scrypt try to
  // allocate them and take the process down.
  if (N < 2 || N > 2 ** 22 || r < 1 || r > 64 || p < 1 || p > 16) return null
  try {
    // parts.length === 6 was checked above, so 4 and 5 exist — noUncheckedIndexedAccess
    // can't see that from a .length check, hence the assertions.
    return { N, r, p, salt: Buffer.from(parts[4]!, 'base64'), hash: Buffer.from(parts[5]!, 'base64') }
  } catch {
    return null
  }
}

export const MIN_PASSWORD_LENGTH = 12

function assertPasswordShape(password: string) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  // bcrypt's 72-byte truncation does not apply to scrypt, but an unbounded password is
  // a cheap CPU-exhaustion vector: each attempt costs 64MB of hashing.
  if (Buffer.byteLength(password) > 1024) {
    throw new Error('Password must be at most 1024 bytes')
  }
}
