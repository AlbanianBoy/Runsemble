// ─── Sessions (server-only) ───────────────────────────────────────────────────
// Cookie-based login sessions: a random token in an httpOnly cookie.
//
// SECURITY: Only sha256(token) is stored in the database — the plaintext token
// lives solely in the cookie. A database leak (SQL injection, backup exposure,
// rogue read access) yields only hashes, not usable session credentials.
//
// Migration required before deploying:
//   ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT;
//   UPDATE "Session" SET "tokenHash" = encode(sha256(token::bytea), 'hex');
//   ALTER TABLE "Session" ALTER COLUMN "tokenHash" SET NOT NULL;
//   CREATE UNIQUE INDEX session_token_hash_idx ON "Session"("tokenHash");
//   ALTER TABLE "Session" DROP COLUMN token;
// After running the migration, remove the migration note and the fallback
// lookup below.

import { cookies } from 'next/headers'
import { randomBytes, createHash } from 'crypto'
import { db } from './db'

const COOKIE_NAME = 'rs_session'
const SESSION_DAYS = 30

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  // Store ONLY the hash. The plaintext token goes into the cookie and is never
  // persisted anywhere server-side.
  await db.session.create({
    data: {
      // TODO: once the migration above has run, change this to:
      //   tokenHash, userId, expiresAt
      // and remove the `token` field entirely from the Session model.
      token: tokenHash,   // column will be renamed tokenHash after migration
      userId,
      expiresAt,
    },
  })

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

  // Look up by hash — the plaintext token is never stored.
  const tokenHash = hashToken(token)
  const session = await db.session.findUnique({
    where: { token: tokenHash },   // column is `token` until migration renames it
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
  if (token) {
    const tokenHash = hashToken(token)
    await db.session.deleteMany({ where: { token: tokenHash } })
  }
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
