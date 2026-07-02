// ─── Sessions (server-only) ───────────────────────────────────────────────────
// Cookie-based login sessions: a random token in an httpOnly cookie, matched
// against the Session table. Deliberately boring — no JWT, easy to revoke.

import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { db } from './db'

const COOKIE_NAME = 'rs_session'
const SESSION_DAYS = 30

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.session.create({ data: { token, userId, expiresAt } })
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
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  return session.user
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (token) await db.session.deleteMany({ where: { token } })
  store.delete(COOKIE_NAME)
}

/** Strip fields that must never leave the server. */
export function toSafeUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _ph, ...safe } = user
  return safe
}
