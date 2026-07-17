import { haversineKm, type LatLng } from '@/lib/geo'

// ─── Run math ─────────────────────────────────────────────────────────────────
// Pure, testable versions of the calculations that live inside the RunTracker
// component: distance filtering, wall-clock elapsed time, and split detection.
// Extracted so the tricky background-resume behaviour — buffered GPS points that
// arrive far apart in BOTH distance and time — can be unit-tested without the
// component, and so the tracking rules have one documented source of truth.

/**
 * A reading less accurate than this (metres) doesn't contribute to distance.
 * 25m was too strict for a phone in a pocket, where the body blocks half the sky
 * and fixes come back at ~30–45m — good enough to trace a route, but they were
 * being thrown away, leaving a straight line. 45m keeps out genuinely useless
 * fixes while letting pocket-quality ones through; the jitter + speed filters
 * below still reject stationary drift.
 */
export const ACCURACY_GATE_M = 45
/** Ignore sub-step jitter below this move (km). */
export const MIN_MOVE_KM = 0.005
/** Fastest plausible pace for a run / e-scooter (m/s); caps the per-gap jump. */
export const MAX_SPEED_MPS = 12
/** Floor for the jump cap (km) so short-gap teleports are still rejected. */
export const MIN_JUMP_CAP_KM = 0.06

/**
 * Distance (km) a move should add to the total, or 0 if it must be rejected.
 * A move counts when: the reading is accurate enough, it's a real step
 * (> MIN_MOVE_KM), and the jump is plausible for the time since the last fix
 * (≤ MAX_SPEED_MPS). The time-scaled cap is the key change from a fixed 60m
 * limit: it lets buffered background points — far apart in distance because they
 * are far apart in time — reconstruct real distance instead of being discarded.
 */
export function moveDistanceKm(
  prev: LatLng,
  next: LatLng,
  accuracyM: number | null,
  gapMs: number,
): number {
  if (accuracyM != null && accuracyM > ACCURACY_GATE_M) return 0
  const d = haversineKm(prev, next)
  const gapSec = Math.max(1, gapMs / 1000)
  const maxJumpKm = Math.max(MIN_JUMP_CAP_KM, (MAX_SPEED_MPS * gapSec) / 1000)
  return d > MIN_MOVE_KM && d < maxJumpKm ? d : 0
}

/**
 * Wall-clock elapsed seconds. `base` is time banked before the current running
 * segment; `runningSinceMs` is when the current segment started (null = paused).
 * Derived from timestamps so a timer whose ticks were suspended in the
 * background snaps to the true elapsed time the moment it recomputes.
 */
export function computeElapsedSec(base: number, runningSinceMs: number | null, nowMs: number): number {
  if (runningSinceMs == null) return Math.max(0, Math.floor(base))
  return Math.floor(base + Math.max(0, nowMs - runningSinceMs) / 1000)
}

/** True when the total distance crossed a whole-km boundary (→ record a split). */
export function crossedKm(prevKm: number, nextKm: number): boolean {
  return Math.floor(nextKm) > Math.floor(prevKm)
}

// ─── Server-side run verification ─────────────────────────────────────────────
// The pace/total bounds on POST /api/runs check that a claim is internally
// consistent, but they trust the claimed distance itself — so a request with no
// GPS at all can bank a full run's XP just by choosing a believable pace.
//
// The tempting fix — recompute distance from the submitted path and compare — DOES
// NOT WORK with this data model, and it's worth writing down why so nobody tries
// it again. The stored path is a decorative route sketch: the client thins it 3:1
// AND rounds to 5 decimals, while the distance is accumulated live from the full
// fix stream. Measured against real recorded runs, the path sums to 2–30% of the
// true distance — a 2.43 km run stored a path summing to 0.04 km. There is no
// ceiling that accepts that real run while still rejecting an inflated one; the
// path simply isn't a distance record. A stricter check would reject real runs,
// which is far worse than letting an inflated one through at this scale.
//
// So this checks only the one thing the data can support unambiguously: a
// substantial distance claimed with NO route at all. A real tracked run always
// carries at least one point once any distance accumulates (distance comes from
// fixes, fixes become points), so distance-with-zero-points is a claim with zero
// evidence — the bare `{distanceKm: 15}` request. It does not stop a forger who
// also fabricates a path; making it do so needs the client to store verifiable
// distance, which is a separate change with its own accuracy cost.

/** Straight-line length (km) of a submitted path. Exposed for diagnostics/tests. */
export function pathDistanceKm(path: Array<LatLng>): number {
  let km = 0
  for (let i = 1; i < path.length; i++) km += haversineKm(path[i - 1], path[i])
  return km
}

/**
 * A distance claim above this, carried with no GPS points at all, is treated as
 * unsupported. Below it, allow anything: timing-only mode (GPS denied) reports
 * ~0 distance with no path, and a sub-2km glitch isn't worth risking a real run
 * over.
 */
export const RUN_UNVERIFIABLE_MAX_KM = 2.0

export type RunVerdict = { ok: true } | { ok: false; reason: string }

/**
 * Reject a substantial distance claimed with no route behind it at all.
 *
 * Intentionally narrow: it fires only on zero usable points, because the path
 * cannot corroborate distance (see the note above) and a stricter rule rejects
 * real runs. Any run that actually recorded GPS passes.
 */
export function verifyRunDistance(claimedKm: number, path: Array<LatLng> | null | undefined): RunVerdict {
  const claim = Number(claimedKm) || 0
  if (claim <= RUN_UNVERIFIABLE_MAX_KM) return { ok: true }

  const points = Array.isArray(path) ? path.filter(isLatLng) : []
  if (points.length === 0) {
    return { ok: false, reason: 'Run has no GPS data to support the distance claimed' }
  }
  return { ok: true }
}

function isLatLng(p: unknown): p is LatLng {
  return (
    typeof p === 'object' &&
    p !== null &&
    Number.isFinite((p as LatLng).lat) &&
    Number.isFinite((p as LatLng).lng)
  )
}
