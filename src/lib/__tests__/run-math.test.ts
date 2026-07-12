import { describe, it, expect } from 'vitest'
import { moveDistanceKm, computeElapsedSec, crossedKm, MIN_JUMP_CAP_KM } from '@/lib/run-math'

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
