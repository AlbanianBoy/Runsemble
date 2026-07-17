import { describe, it, expect } from 'vitest'
import {
  moveDistanceKm,
  computeElapsedSec,
  crossedKm,
  MIN_JUMP_CAP_KM,
  pathDistanceKm,
  verifyRunDistance,
} from '@/lib/run-math'

// A straight ~1 km run: 0.009° of latitude is ~1 km. Ten evenly spaced points,
// which is roughly what survives 3:1 thinning of a short real run.
const KM_PATH = Array.from({ length: 10 }, (_, i) => ({ lat: 51.2 + i * 0.001, lng: 4.4 }))

// At ~51.2°N, 0.0001° of latitude ≈ 11.1 m — a convenient way to build moves of
// a known size for the distance filter.
const P = (dLatDeg: number) => ({ lat: 51.2 + dLatDeg, lng: 4.4 })
const A = { lat: 51.2, lng: 4.4 }

describe('moveDistanceKm', () => {
  it('counts a normal walking step (good accuracy, short gap)', () => {
    const d = moveDistanceKm(A, P(0.0001), 8, 3000) // ~11 m over 3 s
    expect(d).toBeGreaterThan(0)
    expect(d).toBeCloseTo(0.0111, 3)
  })

  it('rejects sub-step jitter (< 5 m)', () => {
    expect(moveDistanceKm(A, P(0.00002), 8, 3000)).toBe(0) // ~2.2 m
  })

  it('rejects readings worse than the accuracy gate', () => {
    expect(moveDistanceKm(A, P(0.0001), 60, 3000)).toBe(0) // 11 m move but ±60 m fix
  })

  it('accepts a pocket-quality fix at the relaxed gate', () => {
    // ±40 m used to be rejected; a phone in a pocket reads around here, and the
    // move is real, so it should now count.
    expect(moveDistanceKm(A, P(0.0001), 40, 3000)).toBeGreaterThan(0)
  })

  it('accepts a fast move that is plausible for a long gap (e-scooter / buffered points)', () => {
    // ~111 m over 30 s ≈ 3.7 m/s — well within the 12 m/s cap. This is the
    // background-resume case the fixed-60m filter used to throw away.
    const d = moveDistanceKm(A, P(0.001), 10, 30_000)
    expect(d).toBeGreaterThan(0)
    expect(d).toBeCloseTo(0.111, 2)
  })

  it('rejects the same distance as a teleport when the gap is short', () => {
    // ~111 m over 1 s ≈ 111 m/s — impossible; capped at the 60 m floor → rejected.
    expect(moveDistanceKm(A, P(0.001), 10, 1000)).toBe(0)
  })

  it('caps short-gap jumps at the 60 m floor regardless of speed math', () => {
    // A 55 m move over 1 s: under the 60 m floor, so it counts.
    const d = moveDistanceKm(A, P(0.0005), 8, 1000) // ~55 m
    expect(d).toBeGreaterThan(0)
    expect(d).toBeLessThan(MIN_JUMP_CAP_KM)
  })
})

describe('computeElapsedSec', () => {
  it('returns the banked base while paused (no running segment)', () => {
    expect(computeElapsedSec(100, null, 999_999)).toBe(100)
  })

  it('adds the current running segment', () => {
    expect(computeElapsedSec(100, 1_000, 6_000)).toBe(105) // +5 s
  })

  it('snaps to the true elapsed after a suspended timer resumes', () => {
    // Banked 13 min, running since t0, now 22 min later → 35 min total. This is
    // the fix: a frozen WebView timer catches up instead of under-counting.
    const t0 = 1_000_000
    const elapsed = computeElapsedSec(13 * 60, t0, t0 + 22 * 60 * 1000)
    expect(elapsed).toBe(35 * 60)
  })

  it('never goes negative on a clock that jumped backwards', () => {
    expect(computeElapsedSec(0, 5_000, 4_000)).toBe(0)
  })
})

describe('crossedKm', () => {
  it('detects crossing a whole-km boundary', () => {
    expect(crossedKm(0.9, 1.05)).toBe(true)
  })
  it('does not fire within the same km', () => {
    expect(crossedKm(1.1, 1.2)).toBe(false)
    expect(crossedKm(0.5, 0.9)).toBe(false)
  })
})

describe('pathDistanceKm', () => {
  it('sums the legs of a path', () => {
    // ~1 km of latitude across the ten points.
    expect(pathDistanceKm(KM_PATH)).toBeCloseTo(1.0, 1)
  })

  it('is 0 for fewer than two points', () => {
    expect(pathDistanceKm([])).toBe(0)
    expect(pathDistanceKm([{ lat: 51.2, lng: 4.4 }])).toBe(0)
  })
})

describe('verifyRunDistance', () => {
  // The check is narrow ON PURPOSE. The stored path is a thinned, rounded route
  // sketch that sums to a fraction of the true distance — measured against real
  // runs, a 2.43 km run stored a path summing to 0.04 km. So distance cannot be
  // recomputed from it, and the only safe signal is "substantial claim, zero
  // GPS points". These are the two cases that matter:

  it('rejects a substantial claim with no GPS at all — the pure-cURL attack', () => {
    // {distanceKm: 15} with no path banks a full run's XP at a chosen pace.
    expect(verifyRunDistance(15, null).ok).toBe(false)
    expect(verifyRunDistance(15, []).ok).toBe(false)
  })

  // The disaster this replaced: an earlier version compared the claim to the path
  // distance and rejected BOTH real production runs. Any run that recorded even
  // one point must pass, however sparse — that is the whole correctness bar.
  it('accepts a real run whose sparse path under-counts badly', () => {
    // Mirrors real prod data: 2.43 km claimed, a 2-point path summing to ~0.04 km.
    const sparse = [{ lat: 51.2, lng: 4.4 }, { lat: 51.2003, lng: 4.4001 }]
    expect(verifyRunDistance(2.43, sparse).ok).toBe(true)
    // And the other real one: 1.2 km over a 12-point, 0.37 km path.
    expect(verifyRunDistance(1.2, KM_PATH).ok).toBe(true)
  })

  it('lets a claim up to the threshold through without a path', () => {
    // Timing-only mode (GPS denied) reports ~0 distance and no path; a small
    // glitch is not worth risking a real run over.
    expect(verifyRunDistance(2.0, null).ok).toBe(true)
    expect(verifyRunDistance(0, null).ok).toBe(true)
  })

  it('accepts a big claim as long as it recorded any real point', () => {
    // The path cannot corroborate distance, so a single valid point is enough to
    // treat the run as tracked rather than fabricated.
    expect(verifyRunDistance(20, [{ lat: 51.2, lng: 4.4 }]).ok).toBe(true)
  })

  it('treats a path of junk points as no path', () => {
    const junk = [{ lat: 'x', lng: 'y' }, { foo: 1 }] as unknown as { lat: number; lng: number }[]
    expect(verifyRunDistance(15, junk).ok).toBe(false)
  })
})
