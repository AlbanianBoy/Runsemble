// ─── Public user projection (server-only) ────────────────────────────────────
// What one user is allowed to see about another. Anything not listed here
// (email, passwordHash, consent timestamps, ...) never leaves the server, and
// coordinates are snapped to the same ~200m privacy grid the map promises —
// server-side, so exact home locations aren't visible in the network tab.

import { fuzzCoordForUser } from './location-privacy'
import { canSeeAvailability } from './enums'
import { isInsideSafeZone, type SafeZoneLike } from './safe-zones'

/**
 * Who is asking. Availability is the one field whose visibility depends on the
 * viewer, so the projection needs to know them. Passing null (or omitting it)
 * is treated as an anonymous viewer and gets the restrictive answer.
 */
export interface Viewer {
  id: string
  gender: string | null
}

interface UserRow {
  id: string
  name: string
  avatar: string | null
  bio: string | null
  city: string
  lat: number | null
  lng: number | null
  gender: string | null
  verified: boolean
  preferredSport: string
  paceLevel: string
  schedulePreference: string
  xp: number
  streak: number
  longestStreak: number
  totalRuns: number
  totalPeopleRunWith: number
  totalDistanceKm: number
  totalDurationSec: number
  isAvailable: boolean
  availableFrom: Date | null
  availableUntil: Date | null
  privacyVisible: boolean
  createdAt: Date
}

/** Extra relations some endpoints attach (badges, groups, ...) pass through. */
export function toPublicUser<T extends UserRow>(
  {
    // Split off everything sensitive; `rest` carries relations through untouched.
    ...user
  }: T,
  viewer?: Viewer | null
) {
  const {
    lat,
    lng,
    privacyVisible,
    ...rest
  } = user as UserRow & Record<string, unknown>

  // Safe zones: inside one, this user shares no location at all. Checked on the
  // EXACT stored coordinates, before fuzzing — the fuzz is a display courtesy,
  // the zone is a promise. Callers attach `safeZones` by including the relation;
  // a caller that doesn't simply gets no suppression (and no zones exist unless
  // the user made some).
  const zones = Array.isArray((user as Record<string, unknown>).safeZones)
    ? ((user as Record<string, unknown>).safeZones as SafeZoneLike[])
    : []
  const inSafeZone =
    typeof lat === 'number' && typeof lng === 'number' && zones.length > 0
      ? isInsideSafeZone({ lat, lng }, zones)
      : false

  // Hidden profiles share no location at all; visible ones share a ~200m cell
  // on a grid that is this user's alone — see location-privacy.ts for why one
  // shared grid meant a pin named a specific rectangle rather than a rough area.
  const fuzzed =
    !inSafeZone && privacyVisible && typeof lat === 'number' && typeof lng === 'number'
      ? fuzzCoordForUser({ lat, lng }, user.id, 200)
      : null

  // Availability is the one field whose visibility depends on who's looking.
  // "Free at 18:30", repeated week after week, is a routine — and it sits right
  // next to a home cell on the map. Someone who has restricted it to women is
  // still discoverable; only the schedule goes quiet. You always see your own.
  const audience = (user as Record<string, unknown>).availabilityAudience
  const hideAvailability =
    viewer?.id !== user.id && !canSeeAvailability(viewer?.gender, audience as string | null)
  if (hideAvailability) {
    rest.isAvailable = false
    rest.availableFrom = null
    rest.availableUntil = null
  }
  // The setting itself is the owner's business, not a hint for anyone else
  // about whether there's something being withheld.
  delete (rest as Record<string, unknown>).availabilityAudience

  // Re-assert the public scalar whitelist by deleting known-sensitive keys that
  // arrive when callers query full rows (defense in depth against future
  // schema additions leaking by default).
  delete (rest as Record<string, unknown>).email
  delete (rest as Record<string, unknown>).passwordHash
  delete (rest as Record<string, unknown>).consentAt
  delete (rest as Record<string, unknown>).emailVerifiedAt
  delete (rest as Record<string, unknown>).lastActiveDate
  // Zone centres are home addresses — strictly owner-only, never in a public payload.
  delete (rest as Record<string, unknown>).safeZones

  return {
    ...rest,
    privacyVisible,
    lat: fuzzed?.lat ?? null,
    lng: fuzzed?.lng ?? null,
  }
}
