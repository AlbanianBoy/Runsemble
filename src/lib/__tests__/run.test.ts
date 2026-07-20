import { describe, it, expect } from 'vitest'
import {
  formatClock,
  formatPaceLabel,
  paceFromRun,
  parsePath,
  parseSplits,
  toPublicPath,
} from '@/lib/run'

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(61)).toBe('1:01')
    expect(formatClock(599)).toBe('9:59')
  })
  it('adds hours past 60 minutes', () => {
    expect(formatClock(3600)).toBe('1:00:00')
    expect(formatClock(3725)).toBe('1:02:05')
  })
  it('clamps negatives to zero', () => {
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('formatPaceLabel', () => {
  it('formats whole-second paces', () => {
    expect(formatPaceLabel(300)).toBe('5:00 /km')
    expect(formatPaceLabel(359)).toBe('5:59 /km')
  })
  it('shows a dash when there is no pace yet', () => {
    expect(formatPaceLabel(0)).toBe('—')
    expect(formatPaceLabel(-10)).toBe('—')
    expect(formatPaceLabel(NaN)).toBe('—')
  })
})

describe('paceFromRun', () => {
  it('computes seconds per km', () => {
    expect(paceFromRun(5, 1500)).toBe(300)
  })
  it('returns 0 for a zero-distance run', () => {
    expect(paceFromRun(0, 600)).toBe(0)
  })
})

describe('parsePath / parseSplits (defensive parsing)', () => {
  it('round-trips a valid path', () => {
    const path = JSON.stringify([{ lat: 51.2, lng: 4.4 }, { lat: 51.21, lng: 4.41 }])
    expect(parsePath(path)).toHaveLength(2)
  })
  it('filters malformed entries instead of crashing', () => {
    const path = JSON.stringify([{ lat: 51.2, lng: 4.4 }, { lat: 'x' }, null, 42])
    expect(parsePath(path)).toHaveLength(1)
  })
  it('returns [] for garbage, null, and non-arrays', () => {
    expect(parsePath('not json')).toEqual([])
    expect(parsePath(null)).toEqual([])
    expect(parsePath(JSON.stringify({ lat: 1 }))).toEqual([])
  })
  it('parses splits and drops non-numbers', () => {
    expect(parseSplits(JSON.stringify([310, 305, 'x', null]))).toEqual([310, 305])
    expect(parseSplits('garbage')).toEqual([])
  })
})

describe('toPublicPath', () => {
  // A straight 2.2km line north from central Antwerp, ~55m between points.
  const line = (n: number) =>
    JSON.stringify(
      Array.from({ length: n }, (_, i) => ({ lat: 51.2194 + i * 0.0005, lng: 4.4025 }))
    )

  it('withholds the start and the end of the route', () => {
    const points = parsePath(toPublicPath(line(40)))
    expect(points.length).toBeGreaterThan(0)
    // Nothing survives within 250m of either original endpoint.
    expect(points[0].lat).toBeGreaterThan(51.2194 + 0.0022)
    expect(points[points.length - 1].lat).toBeLessThan(51.2194 + 39 * 0.0005 - 0.0022)
  })

  it('thins a long trace to a drawable number of points', () => {
    const points = parsePath(toPublicPath(line(4000)))
    expect(points.length).toBeLessThanOrEqual(60)
    expect(points.length).toBeGreaterThan(10)
  })

  it('returns null when the route is too short to blind both ends', () => {
    // ~220m end to end: every point is inside one blind radius or the other.
    expect(toPublicPath(line(5))).toBeNull()
  })

  it('returns null for missing or unusable paths', () => {
    expect(toPublicPath(null)).toBeNull()
    expect(toPublicPath('')).toBeNull()
    expect(toPublicPath('not json')).toBeNull()
    expect(toPublicPath(JSON.stringify([{ lat: 51.2, lng: 4.4 }]))).toBeNull()
  })
})
