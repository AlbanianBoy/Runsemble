// ─── Location privacy: a per-person grid (server-only) ───────────────────────
//
// The map has always snapped a runner's position to a ~200m cell before showing
// it. The weakness was that everyone shared ONE grid, aligned to whole
// multiples of the cell size from the equator and the prime meridian. Anyone
// who read this repository — or just watched two pins and noticed they never
// land between the lines — knew exactly where every cell boundary sat. From
// that, a displayed pin doesn't mean "somewhere within 200m of here", it means
// "inside this specific rectangle", and a rectangle is a thing you can walk to
// and look at. Two runners reporting the same cell were provably within 200m of
// each other, in a rectangle you could name.
//
// So the grid is now offset per person, by an amount derived from a server
// secret. Same runner, same offset, forever; different runners, unrelated
// offsets. What that buys:
//
//   • The cell boundaries are no longer public knowledge, so a pin means
//     "within ~200m, in an unknown direction" rather than a named rectangle.
//   • Two people in the same place no longer report the same coordinates, so
//     you can't infer that two accounts are near each other from equal pins.
//   • Knowing the algorithm isn't enough — you'd need LOCATION_SALT.
//
// What it deliberately does NOT do: rotate. A per-person offset that changed
// over time would look stronger and be weaker. Each rotation is an independent
// sample of the same true point, and averaging enough samples converges on it.
// Because the offset is fixed, watching someone for a year yields exactly as
// much as watching them once — the output is a pure function of the input.
//
// This is still a display courtesy and not a guarantee. The guarantee is a safe
// zone (see safe-zones.ts), which suppresses the location entirely and is
// checked against the exact coordinates before any of this runs.

import { createHmac } from 'node:crypto'
import { toRad, type LatLng } from './geo'

const DEFAULT_CELL_METERS = 200

/**
 * Without a configured secret the offset is derived from the user id alone.
 * That still breaks alignment BETWEEN people, so equal pins stop implying equal
 * places — but ids travel in the API payload, so anyone who knows the algorithm
 * can recompute a specific person's grid. Set LOCATION_SALT in production.
 */
const FALLBACK_SALT = 'runsemble-unsalted-fallback'

let warned = false
function salt(): string {
  const configured = process.env.LOCATION_SALT
  if (configured) return configured
  if (!warned && process.env.NODE_ENV === 'production') {
    warned = true
    console.warn(
      '[location-privacy] LOCATION_SALT is not set — the per-user location grid is derivable ' +
        'from public user ids. Set it in the production environment.'
    )
  }
  return FALLBACK_SALT
}

/**
 * Two independent fractions in [0, 1) for this key, from one HMAC. Taking two
 * disjoint 4-byte windows keeps the lat and lng offsets uncorrelated, so the
 * displacement isn't stuck on a diagonal.
 */
function offsetFractions(key: string): [number, number] {
  const digest = createHmac('sha256', salt()).update(key).digest()
  return [digest.readUInt32BE(0) / 2 ** 32, digest.readUInt32BE(4) / 2 ** 32]
}

/**
 * Snap `point` to this user's own ~`meters` grid.
 *
 * Shifting the grid by a fraction of a cell is the same operation as shifting
 * the point by the negative of it, snapping, then shifting back — which is what
 * this does, because it keeps the arithmetic in one place and makes the
 * "deterministic per user" property obvious.
 */
export function fuzzCoordForUser(
  point: LatLng,
  userKey: string,
  meters = DEFAULT_CELL_METERS
): LatLng {
  const [latFrac, lngFrac] = offsetFractions(userKey)

  const latStep = meters / 111_320
  const latOffset = latFrac * latStep
  const snappedLat = Math.round((point.lat - latOffset) / latStep) * latStep + latOffset

  // Longitude cells narrow towards the poles, so the step is derived from the
  // SNAPPED latitude — otherwise two points a few metres apart, either side of
  // a latitude boundary, would use very slightly different grids and never
  // agree. (Same reasoning as the unsalted version this replaces.)
  const cosLat = Math.cos(toRad(snappedLat)) || 1
  const lngStep = meters / (111_320 * cosLat)
  const lngOffset = lngFrac * lngStep
  const snappedLng = Math.round((point.lng - lngOffset) / lngStep) * lngStep + lngOffset

  return { lat: snappedLat, lng: snappedLng }
}
