// ─── Public user projection (server-only) ────────────────────────────────────
// What one user is allowed to see about another. Anything not listed here
// (email, passwordHash, consent timestamps, ...) never leaves the server, and
// coordinates are snapped to the same ~200m privacy grid the map promises —
// server-side, so exact home locations aren't visible in the network tab.

import { fuzzCoord } from './geo'
import { isInsideSafeZone, type SafeZoneLike } from './safe-zones'

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
export function toPublicUser<T extends UserRow>({
  // Split off everything sensitive; `rest` carries relations through untouched.
  ...user
}: T) {
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

  // Hidden profiles share no location at all; visible ones share a ~200m cell.
  const fuzzed =
    !inSafeZone && privacyVisible && typeof lat === 'number' && typeof lng === 'number'
      ? fuzzCoord({ lat, lng }, 200)
      : null

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
