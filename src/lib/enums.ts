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

export const PACE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
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
