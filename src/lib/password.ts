// ─── Password hashing (server-only) ──────────────────────────────────────────
// scrypt from node:crypto — no external dependency, memory-hard, and a
// constant-time comparison. Stored format: "<salt-hex>:<hash-hex>".
//
// Policy lives in password-policy.ts so the account form can share it without
// pulling node:crypto into the client bundle.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

export { validatePassword } from '@/lib/password-policy'

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
