// ─── Sharing a live run with one person, and the button that says HELP ───────
//
// A runner going out at night hands one person a URL. That person opens it in
// whatever browser they already have — no account, no app, no install — and
// watches a dot move. The link dies when the run is saved, or when the runner
// revokes it, or four hours after it was minted, whichever comes first.
//
// Two decisions here are deliberate, and both are the kind that a well-meaning
// future reader would otherwise "fix":
//
//   • The position shown to the watcher is EXACT. Everywhere else in this
//     product a coordinate is snapped to a ~200m cell (location-privacy.ts) and
//     suppressed outright inside a safe zone (safe-zones.ts). None of that is
//     applied here, on purpose. A contact sent to a blurred 200m cell cannot
//     find anyone — and finding someone is the entire reason the link exists.
//     This is the one place in the product where precision beats privacy, and
//     it is bounded rather than absolute: opt-in, one run, one person the runner
//     chose, revocable at any moment, and dead within four hours regardless.
//
//   • The watcher learns a FIRST NAME and nothing else. They already know who
//     sent them the link, so the name is orientation, not identification — and
//     a URL sent over a messenger gets forwarded. A full name next to a live
//     exact position on an unauthenticated page is a dossier.
//
// This module imports nothing from Prisma or the database. It takes plain rows
// and returns plain data, so the lifecycle rules — the part that is genuinely
// dangerous to get wrong in either direction — are testable without a database,
// and the client can import the same types the server serialises.

import { randomBytes } from 'node:crypto'

/**
 * Hard ceiling on a share, counted from when it was minted rather than from the
 * last sign of life. A share that outlives the run it belongs to is a location
 * feed nobody remembers agreeing to. Four hours covers a marathon plus the walk
 * home, and a runner who needs longer can mint a second link deliberately.
 */
export const SHARE_TTL_MS = 4 * 60 * 60 * 1000

/**
 * How old the last fix may get before the watcher is told the feed has gone
 * quiet. A phone in a pocket, in a tunnel, under trees or with the screen off
 * loses GPS constantly, and calling that "ended" would be a lie in the exact
 * direction that causes panic. So there is a third word for it — see
 * `shareStatus` — and the last known position stays on screen with its age.
 */
export const STALE_AFTER_MS = 3 * 60 * 1000

/**
 * How often the running phone posts its position. Twenty seconds is frequent
 * enough that a watcher sees movement rather than teleportation, cheap enough
 * on battery to survive a long run, and leaves nine consecutive failures before
 * the watcher is warned — so one lost fix never raises a false alarm.
 */
export const BEACON_INTERVAL_MS = 20_000

/**
 * The token in `/watch/<token>` IS the credential — there is no login on the
 * watch page, so holding the URL is the whole of the authorisation. That rules
 * out a cuid, which is what every other id in this schema uses: cuids embed a
 * timestamp and a per-process counter, so they are sequential and partially
 * predictable, and one leaked link would narrow the search for others. 32 bytes
 * from the CSPRNG are not guessable at any rate an attacker can sustain.
 */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url')
}

export type ShareStatus = 'live' | 'stale' | 'ended' | 'expired' | 'revoked'

/** The four timestamps that decide whether a link is still worth anything. */
export interface ShareLifecycle {
  expiresAt: Date
  endedAt: Date | null
  revokedAt: Date | null
  lastPingAt: Date | null
}

/**
 * Which of the five words describes this share right now.
 *
 * Precedence is fixed and checked in this order: revoked, then ended, then
 * expired, then the liveness of the last fix. It matters because the states
 * overlap constantly — a share that was revoked an hour ago is also, by now,
 * expired — and the runner's own decision to pull the link is the most specific
 * fact about it, so it is the one the watcher is shown. A revoked share must
 * never read as merely "expired", which sounds like something that happened to
 * it rather than something the runner did.
 */
export function shareStatus(row: ShareLifecycle, now: number): ShareStatus {
  if (row.revokedAt) return 'revoked'
  if (row.endedAt) return 'ended'
  if (row.expiresAt.getTime() <= now) return 'expired'
  // No ping yet means the share was minted before the first GPS fix landed.
  // That is "we have nothing to show you", which is stale, not live.
  if (!row.lastPingAt) return 'stale'
  return now - row.lastPingAt.getTime() > STALE_AFTER_MS ? 'stale' : 'live'
}

/**
 * Whether the watcher may see coordinates at all.
 *
 * True for 'live' and 'stale' only. A stale share keeps showing the last known
 * position — that is the entire point of having the word, since "he was here
 * three minutes ago" is what a worried contact actually needs. The other three
 * states mean the link is over, and a finished link that still renders a dot
 * would leak exactly what the expiry exists to stop.
 */
export function positionVisible(status: ShareStatus): boolean {
  return status === 'live' || status === 'stale'
}

/**
 * First word of a name, falling back to the whole string when there is no word
 * to take (a name that is empty or all whitespace). Never throws: this runs on
 * a public page and a blank display name must not take it down.
 */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0]
  return first || name
}

/** What the payload builder needs from a row. Deliberately not a Prisma type. */
export interface PublicRunShareRow extends ShareLifecycle {
  sosAt: Date | null
  lat: number | null
  lng: number | null
  accuracyM: number | null
  distanceKm: number
  durationSec: number
  createdAt: Date
  user: { name: string; avatar: string | null }
}

/**
 * Everything an unauthenticated watcher is ever told. Note what is absent: no
 * user id, no email, no city, no surname, no profile link, no share token. The
 * page is reachable by anyone the link reaches, so this shape is the boundary —
 * if a field is not here, forwarding the URL cannot expose it.
 */
export interface PublicRunShare {
  status: ShareStatus
  runner: { name: string; avatar: string | null }
  sos: boolean
  sosAt: string | null
  position: { lat: number; lng: number; accuracyM: number | null; at: string } | null
  distanceKm: number
  durationSec: number
  startedAt: string
  expiresAt: string
}

/** Project a share row into the public payload. `now` is injected so the
 *  status a watcher sees is decided by one clock, and so this is testable. */
export function toPublicRunShare(row: PublicRunShareRow, now: number): PublicRunShare {
  const status = shareStatus(row, now)

  // Destructured so the null checks narrow, rather than asserting with `!`.
  const { lat, lng, lastPingAt } = row

  // These coordinates are NOT passed through the safe-zone or grid-fuzzing that
  // every other published position in this app gets. See the note at the top of
  // the file: a watcher handed a 200m cell cannot reach the person inside it.
  // When there is nothing to show, this is null — never zeroed coordinates,
  // which would put the runner in the Gulf of Guinea and read as a real fix.
  const position =
    positionVisible(status) && lat !== null && lng !== null
      ? {
          lat,
          lng,
          accuracyM: row.accuracyM,
          // A position with no age is worse than no position, so fall back to
          // the share's own start if a row somehow carries coordinates without
          // a ping time. The watch page renders this as "N minutes ago".
          at: (lastPingAt ?? row.createdAt).toISOString(),
        }
      : null

  return {
    status,
    // First name only, and the avatar the runner already publishes.
    runner: { name: firstName(row.user.name), avatar: row.user.avatar },
    // An alarm raised is a fact about the run, so it survives the run ending —
    // a contact who opens the link late must still see that it was raised.
    sos: row.sosAt !== null,
    sosAt: row.sosAt?.toISOString() ?? null,
    position,
    distanceKm: row.distanceKm,
    durationSec: row.durationSec,
    startedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}
