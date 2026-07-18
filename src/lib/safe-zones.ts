import { haversineKm, type LatLng } from '@/lib/geo'

// ─── Safe zones ───────────────────────────────────────────────────────────────
// An area where a user's location is never shared. The map already fuzzes every
// pin to a ~200m cell, but an approximate pin at the same spot every evening
// still says where someone sleeps; inside a zone the answer is nothing at all.
//
// Pure functions: the enforcement decision is the part that must be testable
// without a database, because getting it wrong in either direction is bad —
// leak a home, or make someone permanently invisible by accident.

export interface SafeZoneLike {
  lat: number
  lng: number
  radiusM: number
}

/** Zones per user. Home, work, gym, a partner's place — five covers a life. */
export const MAX_SAFE_ZONES = 5
/** Bounds on the radius (metres). Below 100m the zone outlines the building it
 * hides; above 2km it swallows a district and the map goes uselessly empty. */
export const MIN_ZONE_RADIUS_M = 100
export const MAX_ZONE_RADIUS_M = 2000

/** True when `pos` lies inside any of `zones`. Boundary counts as inside. */
export function isInsideSafeZone(pos: LatLng, zones: SafeZoneLike[]): boolean {
  return zones.some((z) => haversineKm(pos, { lat: z.lat, lng: z.lng }) * 1000 <= z.radiusM)
}

/** Clamp a requested radius into the allowed band rather than rejecting it. */
export function clampZoneRadius(radiusM: unknown): number {
  const r = Math.round(Number(radiusM))
  if (!Number.isFinite(r)) return 500
  return Math.min(MAX_ZONE_RADIUS_M, Math.max(MIN_ZONE_RADIUS_M, r))
}
