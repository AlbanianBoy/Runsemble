import { NextResponse } from 'next/server'

// ─── The request boundary ─────────────────────────────────────────────────────
// The three things a route does before it can trust anything it was sent: read
// the body, refuse the request in a shape a client can branch on, and bound a
// number or a string that arrived over the network.
//
// This deliberately does not validate fields, and must not grow into that:
// enums.ts owns closed value sets (isOneOf / validateEnumFields) and limits.ts
// owns text length (LIMITS / overLimit). The migrated routes still call both.
// This is the layer underneath — it decides whether there is a body worth
// handing to either of them.

/**
 * Machine-readable failure codes.
 *
 * Closed on purpose, and derived by reading what the routes actually return
 * (auth/login, auth/signup, runs, groups, messages, hotspots/[id]/join, feed,
 * invites) rather than from a table of HTTP statuses. A code that no route can
 * produce is a promise to clients that nothing keeps.
 *
 * Why it exists at all: onboarding.tsx decides whether a join already happened
 * with `e.message.toLowerCase().includes('already')` — it is matching the prose
 * of 'Already joined this hotspot'. Reword that sentence, or translate it, and
 * the button silently stops marking the run as joined, with no failing test and
 * nothing in Sentry. The sentence belongs to the person reading it; the code is
 * the part a client is allowed to depend on.
 */
export const ERROR_CODES = [
  // 400 — never got as far as being a request. Previously a 500, because a bare
  // `await request.json()` throws inside the handler's try/catch.
  'malformed_json',
  // 400 — a field the route needs is absent or empty: 'content is required'.
  'missing_field',
  // 400 — present, but not something the route accepts. Enum rejections from
  // validateEnumFields land here, as does "You can't invite yourself".
  'invalid_value',
  // 400 — past a LIMITS cap: 'Message is too long'. Its own code because it is
  // the one 400 a client can pre-empt with a character counter.
  'too_long',
  // 401 — no session: 'Please log in'.
  'unauthenticated',
  // 401 — credentials were offered and refused: 'Wrong email or password'. Same
  // status as the above and a completely different thing to do about it: the
  // login form shows the message, everything else means the session is gone.
  'invalid_credentials',
  // 403 — you are someone, just not someone who may: 'Cannot message this user',
  // 'Join the group to post in it', 'This run is for women only.'
  'forbidden',
  // 403 — a specific, fixable kind of forbidden: the account exists but has not
  // confirmed its address, and anything that reaches another person needs that.
  // Its own code because the client's response is a resend button, not a toast.
  'email_unverified',
  // 404 — 'User not found', 'Hotspot not found', 'That content no longer exists'.
  'not_found',
  // 409 — the state already moved: 'Already joined this hotspot', 'You already
  // have a pending invite to this person', 'An account with this email already
  // exists — try logging in'. This is the code onboarding.tsx should be reading.
  'conflict',
  // 422 — well-formed and internally impossible. Only runs produces it today:
  // 'Invalid run data: pace out of realistic range', and the GPS distance check.
  'unprocessable',
  // 429 — 'Too many attempts — wait a minute and try again'.
  'rate_limited',
  // 410 — POST /api/users, kept closed since account creation moved to
  // /api/auth/signup. Permanent, so a client should stop retrying rather than
  // treat it as a transient failure.
  'gone',
  // 500 — the handler broke: 'Failed to fetch feed posts'. Not a client's fault
  // and nothing it can fix, which is exactly why malformed_json must not be one.
  'internal',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * The one way to say no.
 *
 * Emits the human `error` string unchanged — every client in the app reads that
 * field today, api.ts turns it into the thrown Error's message, and several
 * screens put it straight in front of the user — alongside a `code` that stays
 * put when someone rewrites the sentence.
 *
 * Passing the code and the message the wrong way round is a type error, since
 * ErrorCode is a closed union of literals.
 */
export function apiError(status: number, code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status })
}

export type JsonBody = Record<string, unknown>

export type JsonResult =
  | { ok: true; body: JsonBody }
  | { ok: false; response: NextResponse }

/**
 * Read a JSON object body, or hand back the 400 to return.
 *
 *   const parsed = await readJson(request)
 *   if (!parsed.ok) return parsed.response
 *
 * A bare `await request.json()` throws on a body that was cut off mid-flight, on
 * an empty one, and on anything that isn't JSON at all — and it throws *inside*
 * the handler's try/catch, so the caller was told 'Failed to send message' with
 * a 500 and the incident landed in Sentry as if the server had broken. It
 * hadn't. Nothing about a half-sent body is the server's fault, and a 500 tells
 * a client to retry something that will never succeed.
 *
 * Valid JSON that isn't an object is refused for the same reason: `"hello"` and
 * `[1,2]` parse fine and then every field the route destructures is undefined,
 * so the request dies further down with a misleading message about the first
 * field that happened to be checked.
 */
export async function readJson(request: Request): Promise<JsonResult> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return { ok: false, response: apiError(400, 'malformed_json', 'Invalid JSON body') }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      response: apiError(400, 'malformed_json', 'Request body must be a JSON object'),
    }
  }
  return { ok: true, body: parsed as JsonBody }
}

/**
 * A whole number from an untrusted source, clamped into [min, max], with
 * `fallback` for anything unusable (absent, blank, not a number).
 *
 * Hand-rolled as `Math.min(Math.max(Number(x) || d, lo), hi)` in the feed, which
 * clamps the range but keeps the fraction: `?limit=2.5` reached Prisma as
 * `take: 3.5`, which is not a number of rows. The truncation here is the part
 * that was missing, not the clamp.
 */
export function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * A trimmed string within `max`, or null when there isn't one.
 *
 * Over-long input is rejected rather than sliced, which is the opposite of what
 * a `.slice(0, max)` does and the only safe choice for the things routes bound:
 * an id shortened is not a shorter id, it is a different one, and it would go on
 * to select the wrong row — or none — while looking like it worked. A search box
 * can slice; a `recipientId` cannot.
 */
export function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

/**
 * Cap for an id arriving from a client. Every id in schema.prisma is a cuid (25
 * characters) and the longest thing anyone could reasonably swap in is a uuid
 * (36), so this is roomy — it exists to stop a megabyte of text being carried
 * into a database query, not to police the format.
 */
export const MAX_ID_LENGTH = 64

// ─── Migration status ─────────────────────────────────────────────────────────
// Migrated with readJson + apiError: feed, messages, invites, invites/[id],
// auth/{login,signup,forgot-password,reset-password,verify-email},
// feed/[id]/comments. Further routes are being adopted the same way.
//
// Keep bodyless POSTs (notifications, users/[id]/block) on `.catch(() => ({}))`
// — "no body" means "no options", not a broken client. readJson would 400 them.
//
// Still good candidates for boundedInt / boundedString on query strings:
//   hotspots/users lat-lng-radius, users/search q, groups cursor/q
