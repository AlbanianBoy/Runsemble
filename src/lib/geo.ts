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

/**
 * Snap a coordinate to a privacy grid of roughly `meters`, so a runner's exact
 * position is never exposed. Deterministic: the same input always rounds to the
 * same cell, so the blurred marker doesn't jitter between renders.
 */
export function fuzzCoord(point: LatLng, meters = 200): LatLng {
  const latStep = meters / 111_320
  // Derive the longitude grid from the SNAPPED latitude, so every point inside
  // a cell shares exactly the same grid — otherwise two neighbours a couple of
  // metres apart could snap to microscopically different longitudes.
  const snappedLat = Math.round(point.lat / latStep) * latStep
  const cosLat = Math.cos(toRad(snappedLat)) || 1
  const lngStep = meters / (111_320 * cosLat)
  return {
    lat: snappedLat,
    lng: Math.round(point.lng / lngStep) * lngStep,
  }
}

/** Human-friendly distance label, e.g. "300 m away" or "1.2 km away". */
export function distanceLabel(km: number): string {
  if (km < 1) {
    const m = Math.max(50, Math.round((km * 1000) / 50) * 50)
    return `~${m} m away`
  }
  return `~${km.toFixed(1)} km away`
}
