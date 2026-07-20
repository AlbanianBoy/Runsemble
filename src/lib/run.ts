// ─── Run formatting helpers ───────────────────────────────────────────────────
// Shared between the live run tracker, run history, and feed route cards.

import { haversineKm, type LatLng } from './geo'

/** Parse a stored JSON GPS path into coordinates (defensive against bad data). */
export function parsePath(path?: string | null): LatLng[] {
  if (!path) return []
  try {
    const arr = JSON.parse(path)
    return Array.isArray(arr)
      ? arr.filter((p) => typeof p?.lat === 'number' && typeof p?.lng === 'number')
      : []
  } catch {
    return []
  }
}

// How much of each end of a route to withhold from other people. A run usually
// starts and ends at the runner's front door, so the endpoints are the most
// identifying part of the whole trace.
const ENDPOINT_BLIND_KM = 0.25
// Enough shape to recognise a route, not enough to follow someone's footsteps.
const MAX_PUBLIC_POINTS = 60

/**
 * The version of a GPS trace other people are allowed to see.
 *
 * The owner's own history keeps the full path. For anyone else we drop every
 * point within 250m of the start and of the end, then thin what's left. The
 * route card still reads as that route; it no longer says where you live.
 *
 * Returns a JSON string so callers can hand it straight to `parsePath`, and
 * null when there isn't enough middle left to be worth drawing.
 */
export function toPublicPath(path?: string | null): string | null {
  const points = parsePath(path)
  if (points.length < 2) return null

  const start = points[0]
  const end = points[points.length - 1]
  const middle = points.filter(
    (p) => haversineKm(p, start) > ENDPOINT_BLIND_KM && haversineKm(p, end) > ENDPOINT_BLIND_KM
  )
  // An out-and-back shorter than the blind radius leaves nothing safe to show.
  if (middle.length < 2) return null

  const step = Math.ceil(middle.length / MAX_PUBLIC_POINTS)
  const thinned = step > 1 ? middle.filter((_, i) => i % step === 0) : middle
  return JSON.stringify(thinned)
}

/** Parse stored JSON per-km splits (seconds). */
export function parseSplits(splits?: string | null): number[] {
  if (!splits) return []
  try {
    const arr = JSON.parse(splits)
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : []
  } catch {
    return []
  }
}

/** Seconds → "H:MM:SS" or "M:SS". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Pace in seconds-per-km → "5:30 /km". Returns "—" when there's no distance. */
export function formatPaceLabel(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

/** Compute average pace (sec per km) from distance + duration. */
export function paceFromRun(distanceKm: number, durationSec: number): number {
  return distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0
}

/** Human date like "Jul 1" for run history rows. */
export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
