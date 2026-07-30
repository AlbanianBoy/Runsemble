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
export const REPORT_SUBJECT_TYPES = ['user', 'post', 'message'] as const
export const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'unsafe', 'impersonation', 'other'] as const
export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const
// Self-declared, optional, and only used to gate audience-restricted runs. Kept
// deliberately simple and inclusive — a trans woman selects 'woman'. Which
// audiences each value can join lives in canJoinAudience so the rule is in one
// place; the exact policy is a product/inclusivity call worth the founder's eye.
export const GENDERS = ['woman', 'man', 'nonbinary', 'prefer_not'] as const

export type PaceLevel = (typeof PACE_LEVELS)[number]
export type SchedulePreference = (typeof SCHEDULE_PREFERENCES)[number]
export type SportType = (typeof SPORT_TYPES)[number]
export type PostType = (typeof POST_TYPES)[number]
export type GroupRole = (typeof GROUP_ROLES)[number]
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number]
export type InviteStatus = (typeof INVITE_STATUSES)[number]
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPES)[number]
export type ReportReason = (typeof REPORT_REASONS)[number]
export type ReportStatus = (typeof REPORT_STATUSES)[number]
export type Gender = (typeof GENDERS)[number]

/**
 * Additional friction for women-only spaces. A self-declared 'woman' is necessary
 * but NOT sufficient: there is no reliable, ethical way to verify gender (ID is
 * heavy / exclusionary / privacy-laden; face-AI is biased and wrong), so instead
 * we raise the bar with a profile photo — real accountability for anyone claiming
 * a women-only space, and it nudges photo adoption — plus, once the SMS flow is
 * live, phone verification. The phone gate is enabled with
 * NEXT_PUBLIC_WOMEN_ONLY_REQUIRE_PHONE=true and is OFF by default, so switching it
 * on before verification exists can't lock everyone out. The real backstop is
 * report/block + fast moderation, not this gate.
 */
const WOMEN_ONLY_REQUIRE_PHONE = process.env.NEXT_PUBLIC_WOMEN_ONLY_REQUIRE_PHONE === 'true'

export interface AudienceEligibility {
  gender?: string | null
  avatar?: string | null
  phoneVerified?: boolean | null
}

/** The bar to be inside a women-only space: a self-declared woman WITH a profile
 *  photo (and, when the gate is enabled, phone-verified). */
export function meetsWomenOnlyBar(u: AudienceEligibility): boolean {
  if (u.gender !== 'woman') return false
  if (!u.avatar) return false
  if (WOMEN_ONLY_REQUIRE_PHONE && !u.phoneVerified) return false
  return true
}

/**
 * Whether a runner may join a run restricted to a given audience. Server-side
 * source of truth for "women-only" — without this the badge was cosmetic and
 * anyone could join. 'women' requires meetsWomenOnlyBar; 'beginner' and 'all' are
 * open. Fails a restricted audience closed.
 */
export function canJoinAudience(u: AudienceEligibility, audience: string | null | undefined): boolean {
  if (!audience || audience === 'all' || audience === 'beginner') return true
  if (audience === 'women') return meetsWomenOnlyBar(u)
  return true
}

/**
 * Who may see that you're free to run.
 *
 * Saying "free at 18:30" is the most useful thing in the app and also the most
 * revealing: repeated over a few weeks it is a routine — when you're out, and
 * roughly from where, since it sits next to your fuzzed home cell. Broadcasting
 * that to every nearby stranger was the only option, on an app whose reason to
 * exist is getting people (women especially) out running safely.
 */
export const AVAILABILITY_AUDIENCES = ['everyone', 'women'] as const
export type AvailabilityAudience = (typeof AVAILABILITY_AUDIENCES)[number]

/**
 * Whether `viewerGender` may see a runner whose availability audience is
 * `audience`. Fails closed exactly like canJoinAudience: an unset or unknown
 * audience is treated as restricted rather than open, and a viewer who has not
 * declared a gender does not qualify for a women-only broadcast.
 *
 * Note the asymmetry with canJoinAudience, which defaults an unrecognised
 * audience to open. Joining a run is a thing you do; this is a thing about you
 * that other people see, so an unrecognised value here must not publish it.
 */
export function canSeeAvailability(
  viewer: AudienceEligibility,
  audience: string | null | undefined
): boolean {
  if (!audience || audience === 'everyone') return true
  if (audience === 'women') return meetsWomenOnlyBar(viewer)
  return false
}

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
