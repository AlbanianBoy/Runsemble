// ─── Public user projection (server-only) ────────────────────────────────────
// What one authenticated user is allowed to see about another.
//
// SECURITY RULES:
// 1. This function is only called for authenticated viewers. Routes must check
//    auth before calling toPublicUser — unauthenticated requests should 401
//    before reaching here.
// 2. groupMemberships and joinedHotspots are STRIPPED from the public view.
//    They reveal private group membership and recurring location patterns
//    ("attends Riverside Run every Tuesday at 7am = lives nearby").
// 3. Coordinates are snapped to the ~200m privacy grid — server-side, so exact
//    home locations aren't visible in the network tab.
// 4. safeZone centres are strictly owner-only (they ARE the sensitive location).

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

/** Extra relations some endpoints attach (badges, ...) pass through. */
export function toPublicUser<T extends UserRow>({ ...user }: T) {
  const {
    lat,
    lng,
    privacyVisible,
    ...rest
  } = user as UserRow & Record<string, unknown>

  // Safe zones: inside one, this user shares no location at all.
  const zones = Array.isArray((user as Record<string, unknown>).safeZones)
    ? ((user as Record<string, unknown>).safeZones as SafeZoneLike[])
    : []
  const inSafeZone =
    typeof lat === 'number' && typeof lng === 'number' && zones.length > 0
      ? isInsideSafeZone({ lat, lng }, zones)
      : false

  const fuzzed =
    !inSafeZone && privacyVisible && typeof lat === 'number' && typeof lng === 'number'
      ? fuzzCoord({ lat, lng }, 200)
      : null

  // Sensitive scalar fields — strip these regardless of how the caller
  // constructed the query (defense in depth against future schema leaks).
  delete (rest as Record<string, unknown>).email
  delete (rest as Record<string, unknown>).passwordHash
  delete (rest as Record<string, unknown>).consentAt
  delete (rest as Record<string, unknown>).emailVerifiedAt
  delete (rest as Record<string, unknown>).lastActiveDate

  // Zone centres are home addresses — strictly owner-only.
  delete (rest as Record<string, unknown>).safeZones

  // Group memberships reveal which (possibly private) groups someone is in.
  // A viewer should discover shared groups through their own membership list,
  // not by inspecting another user's profile.
  delete (rest as Record<string, unknown>).groupMemberships

  // Hotspot participation reveals recurring location patterns — effectively a
  // timetable of where this person is and when. Strip from public view.
  delete (rest as Record<string, unknown>).joinedHotspots

  return {
    ...rest,
    privacyVisible,
    lat: fuzzed?.lat ?? null,
    lng: fuzzed?.lng ?? null,
  }
}
