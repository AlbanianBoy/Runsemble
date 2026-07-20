// ─── Password hashing (server-only) ──────────────────────────────────────────
// scrypt from node:crypto — no external dependency, memory-hard, and a
// constant-time comparison. Stored format: "<salt-hex>:<hash-hex>".

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

// The passwords that actually get tried. A credential-stuffing bot works from a
// list like this one, in this order — so a blocklist buys far more than
// composition rules do. Deliberately NO "must contain a symbol and a capital":
// that pushes people to Password1! and a predictable shape, and NIST dropped
// the advice years ago. Length and a blocklist are the parts that hold.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', '12345678', '123456789',
  '1234567890', 'qwertyui', 'qwerty123', 'qwertyuiop', 'iloveyou', 'princess',
  'football', 'baseball', 'welcome1', 'sunshine', 'trustno1', 'superman',
  'starwars', 'whatever', 'freedom1', 'monkey12', 'dragon12', 'letmein1',
  'letmein123', 'admin123', 'abc12345', 'a1b2c3d4', 'zaq12wsx', 'qazwsxedc',
  'runsemble', 'running1', 'runner123',
])

const MIN_LENGTH = 8
// scrypt is memory-hard by design, so an unbounded password is a cheap way to
// make the server do expensive work. 128 is far past any real passphrase.
const MAX_LENGTH = 128

/**
 * Why a password is unacceptable, or null if it's fine.
 *
 * Shared by signup and reset so the two can't drift — a strong rule at the door
 * is worth nothing if the reset flow lets you set "aaaaaaaa" afterwards.
 */
export function validatePassword(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`
  if (password.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters`

  const lower = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lower)) return 'That password is too common — please pick another'

  // "aaaaaaaa" and "111111111" clear a length check and nothing else.
  if (/^(.)\1+$/.test(password)) return 'Password cannot be a single repeated character'

  // Straight runs off the keyboard or the number row.
  if (/^(?:0123456789|123456789|12345678|abcdefgh|qwertyui)/.test(lower)) {
    return 'Password cannot be a simple sequence'
  }

  // Your own address is the first thing anyone guesses.
  const localPart = typeof email === 'string' ? email.split('@')[0]?.toLowerCase() : ''
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return 'Password cannot contain your email address'
  }

  return null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
