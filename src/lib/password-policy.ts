// ─── Password policy (client- and server-safe) ───────────────────────────────
// Pure rules only — no crypto. The server hashes in password.ts; the account
// form mirrors the same sentences so a bad password is refused before the
// round-trip. Keep these two importers in sync by never duplicating the list.

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

export const PASSWORD_MIN_LENGTH = 8
// scrypt is memory-hard by design, so an unbounded password is a cheap way to
// make the server do expensive work. 128 is far past any real passphrase.
export const PASSWORD_MAX_LENGTH = 128

/**
 * Why a password is unacceptable, or null if it's fine.
 *
 * Shared by signup, reset, and the account form so the three can't drift — a
 * strong rule at the door is worth nothing if the reset flow lets you set
 * "aaaaaaaa" afterwards, and the form should refuse for the same reason the
 * server would.
 */
export function validatePassword(password: unknown, email?: string): string | null {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  }

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
