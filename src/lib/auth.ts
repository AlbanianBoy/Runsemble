// ─── Sessions (server-only) ───────────────────────────────────────────────────
// Cookie-based login sessions: a random token in an httpOnly cookie, matched
// against the Session table. Deliberately boring — no JWT, easy to revoke.

import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { db } from './db'

const COOKIE_NAME = 'rs_session'
const SESSION_DAYS = 30

/**
 * What we store instead of the session token itself.
 *
 * Plain SHA-256, deliberately — not scrypt like passwords. A slow KDF exists to
 * make guessing a human-chosen secret expensive, and this secret is 256 bits
 * from randomBytes. There is no dictionary to work through, so the only thing a
 * slow hash would buy here is a slow hash on every authenticated request.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  // The raw token goes to the cookie and is never written down anywhere else.
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

/** The logged-in user for this request, or null. */
export async function getSessionUser() {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  // A suspended account is treated as not-logged-in: every route resolves the
  // acting user through here, so this one check pulls a suspended user out of
  // messaging, hotspots, runs and discovery at once. This is what makes the
  // moderation queue's Suspend action actually stop someone.
  if (session.user.suspendedAt) return null
  return session.user
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  // Explicitly expire the cookie with maxAge: 0 so older WebViews (Capacitor
  // Android) honour the deletion rather than relying on store.delete() alone.
  store.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  store.delete(COOKIE_NAME)
}

/** Strip fields that must never leave the server. */
export function toSafeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _ph, ...safe } = user
  return safe
}
