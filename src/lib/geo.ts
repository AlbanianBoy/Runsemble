// ─── Geo utilities ────────────────────────────────────────────────────────────
// Real distance math + the location-privacy fuzzing the concept promises
// ("locations are shown as approximate, rounded to the nearest 200m").

export interface LatLng {
  lat: number
  lng: number
}

/** Antwerp city centre — default map focus and fallback position. */
export const ANTWERP_CENTER: LatLng = { lat: 51.2194, lng: 4.4025 }

const EARTH_RADIUS_KM = 6371

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

// NOTE: fuzzCoord was here — a plain 200m grid with no per-user offset. It is
// gone rather than deprecated, because an exported function that quietly
// weakens location privacy is one someone will find and use. Everything that
// publishes a position now goes through fuzzCoordForUser in location-privacy.ts,
// which offsets each user's grid by an HMAC of their id and LOCATION_SALT — so
// two runners in the same building no longer snap to the same cell, and the
// cell cannot be recomputed by anyone who knows only the code.

/** Human-friendly distance label, e.g. "300 m away" or "1.2 km away". */
export function distanceLabel(km: number): string {
  if (km < 1) {
    const m = Math.max(50, Math.round((km * 1000) / 50) * 50)
    return `~${m} m away`
  }
  return `~${km.toFixed(1)} km away`
}
