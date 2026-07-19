// ─── Password hashing + validation (server-only) ─────────────────────────────
// scrypt from node:crypto — no external dependency, memory-hard, constant-time.
// Stored format: "<salt-hex>:<hash-hex>".

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

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

// ─── Password strength validation ────────────────────────────────────────────
// Called at signup and password-reset. Returns an error string, or null if OK.
// Intentionally no external dependency — simple rules catch the vast majority
// of credential-stuffing targets ("aaaaaaaa", "12345678", "password1").

const WORST_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'qwertyuiop', 'iloveyou', 'sunshine',
  'princess', 'letmein', 'welcome1', 'monkey123', 'dragon12',
  'master12', 'abc12345', 'football', 'superman', 'batman123',
])

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters'
  }

  // Reject all-same characters: "aaaaaaaa", "11111111"
  if (/^(.)\1+$/.test(password)) {
    return 'Password cannot be all the same character'
  }

  // Reject keyboard walks / sequential runs longer than 4: "12345678", "abcdefgh"
  let maxRun = 1
  let currentRun = 1
  for (let i = 1; i < password.length; i++) {
    const diff = password.charCodeAt(i) - password.charCodeAt(i - 1)
    if (diff === 1 || diff === -1) {
      currentRun++
      maxRun = Math.max(maxRun, currentRun)
    } else {
      currentRun = 1
    }
  }
  if (maxRun >= 6) {
    return 'Password contains too many sequential characters — mix it up'
  }

  // Reject the most common passwords regardless of the rules above.
  if (WORST_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common — please choose a stronger one'
  }

  return null
}
