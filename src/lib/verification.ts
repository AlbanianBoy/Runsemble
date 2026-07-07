// ─── Verification codes (server-only) ─────────────────────────────────────────
// Short-lived 6-digit codes for email verification and password reset. Codes
// are stored as a SHA-256 hash (never in plaintext), single-use, expire in
// 15 min, and are capped at 5 wrong attempts to blunt brute force.

import { createHash, randomInt, timingSafeEqual } from 'crypto'
import { db } from './db'

const CODE_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export type VerificationType = 'email_verify' | 'password_reset'

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** A zero-padded, uniformly random 6-digit code (crypto RNG). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Issue a fresh code for a user+type, invalidating any earlier unconsumed ones
 * so only the newest code is ever valid. Returns the plaintext code to email.
 */
export async function createVerificationCode(
  userId: string,
  type: VerificationType
): Promise<string> {
  const code = generateCode()
  await db.verificationToken.deleteMany({ where: { userId, type, consumedAt: null } })
  await db.verificationToken.create({
    data: {
      userId,
      type,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  })
  return code
}

/**
 * Check a submitted code. On success the token is consumed (single-use). Wrong
 * codes increment an attempt counter; a generic error is returned either way so
 * callers can surface it without leaking which part failed.
 */
export async function consumeVerificationCode(
  userId: string,
  type: VerificationType,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const token = await db.verificationToken.findFirst({
    where: { userId, type, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!token) return { ok: false, error: 'No active code — request a new one.' }
  if (token.expiresAt < new Date()) {
    return { ok: false, error: 'That code has expired — request a new one.' }
  }
  if (token.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts — request a new code.' }
  }

  const expected = Buffer.from(token.codeHash, 'hex')
  const candidate = Buffer.from(hashCode(code), 'hex')
  const match =
    expected.length === candidate.length && timingSafeEqual(candidate, expected)

  if (!match) {
    await db.verificationToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, error: 'Incorrect code — try again.' }
  }

  await db.verificationToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  })
  return { ok: true }
}
