// ─── Closed value sets ────────────────────────────────────────────────────────
// Mirrors the enums in prisma/schema.prisma. These are the request-validation
// copy: the database rejects a bad value with a Prisma error (a 500), which is
// right for integrity but wrong as an API answer — a caller that sends
// paceLevel: "fast" deserves a 400 telling it what's allowed.
//
// Deliberately plain literals rather than re-exports of Prisma's generated
// enums, so client components can import these without pulling the Prisma
// client into the browser bundle. src/lib/__tests__/enums.test.ts asserts every
// set here matches the schema exactly, so the two cannot drift apart in silence.

// 'any' = "I'll run with anyone". A real choice in onboarding, and the map
// matches it against every pace filter — not a placeholder for "unset".
export const PACE_LEVELS = ['beginner', 'intermediate', 'advanced', 'any'] as const
export const SCHEDULE_PREFERENCES = ['morning', 'afternoon', 'evening'] as const
export const SPORT_TYPES = ['running', 'trail', 'walking'] as const
export const POST_TYPES = ['moment', 'milestone', 'question', 'challenge'] as const
export const GROUP_ROLES = ['member', 'admin', 'owner'] as const
export const PARTICIPANT_STATUSES = ['joined', 'here', 'completed', 'cancelled'] as const
export const INVITE_STATUSES = ['pending', 'accepted', 'declined'] as const

export type PaceLevel = (typeof PACE_LEVELS)[number]
export type SchedulePreference = (typeof SCHEDULE_PREFERENCES)[number]
export type SportType = (typeof SPORT_TYPES)[number]
export type PostType = (typeof POST_TYPES)[number]
export type GroupRole = (typeof GROUP_ROLES)[number]
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number]
export type InviteStatus = (typeof INVITE_STATUSES)[number]

/** True when `value` is one of `allowed`. Narrows the type on the way through. */
export function isOneOf<const T extends readonly string[]>(
  allowed: T,
  value: unknown
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/**
 * True when `value` is a comma-separated *set* drawn from `allowed` — "morning",
 * "morning,evening", or "" for none.
 *
 * schedulePreference is stored this way: it used to be a single enum, then
 * onboarding became multi-select (you might run mornings *and* evenings) and the
 * column became a plain String. Validating it with isOneOf rejected exactly the
 * combinations the change existed to allow.
 *
 * Empty means no preference, which is the column default and a legitimate answer.
 * Duplicates are rejected — a set that repeats itself is a bug upstream, not a
 * preference.
 */
export function isCsvSubsetOf<const T extends readonly string[]>(
  allowed: T,
  value: unknown
): boolean {
  if (typeof value !== 'string') return false
  if (value === '') return true
  const parts = value.split(',')
  if (new Set(parts).size !== parts.length) return false
  return parts.every((p) => (allowed as readonly string[]).includes(p))
}

/**
 * Check comma-separated set fields against their value sets. Mirrors
 * validateEnumFields, and skips fields that aren't present.
 */
export function validateCsvEnumFields(
  body: Record<string, unknown>,
  fields: Record<string, readonly string[]>
): string | null {
  for (const [field, allowed] of Object.entries(fields)) {
    const value = body[field]
    if (value === undefined || value === null) continue
    if (!isCsvSubsetOf(allowed, value)) {
      return `${field} must be a comma-separated selection of: ${allowed.join(', ')}`
    }
  }
  return null
}

/**
 * Check request fields against their value sets.
 *
 * Only checks fields that are present, so it suits PATCH bodies where any
 * subset may be sent. Returns a ready-to-send message naming the offending
 * field and what it accepts, or null when everything checks out.
 */
export function validateEnumFields(
  body: Record<string, unknown>,
  fields: Record<string, readonly string[]>
): string | null {
  for (const [field, allowed] of Object.entries(fields)) {
    const value = body[field]
    if (value === undefined || value === null) continue
    if (!isOneOf(allowed, value)) {
      return `${field} must be one of: ${allowed.join(', ')}`
    }
  }
  return null
}
