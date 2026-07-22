import { describe, it, expect } from 'vitest'
import { ANTWERP_CENTER, haversineKm, distanceLabel } from '@/lib/geo'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(ANTWERP_CENTER, ANTWERP_CENTER)).toBe(0)
  })

  it('measures ~1.11 km per 0.01° of latitude', () => {
    const a = { lat: 51.21, lng: 4.4 }
    const b = { lat: 51.22, lng: 4.4 }
    expect(haversineKm(a, b)).toBeCloseTo(1.112, 2)
  })

  it('is symmetric', () => {
    const a = { lat: 51.2119, lng: 4.411 }
    const b = { lat: 51.2134, lng: 4.415 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10)
  })
})

// The fuzzCoord tests moved with the function itself, to
// location-privacy.test.ts. Same three properties are asserted there against
// fuzzCoordForUser — determinism, the one-cell bound, and neighbours sharing a
// cell — plus the per-user offset that made the replacement necessary.

describe('distanceLabel', () => {
  it('rounds sub-km distances to 50m steps', () => {
    expect(distanceLabel(0.32)).toBe('~300 m away')
  })
  it('never claims closer than 50m', () => {
    expect(distanceLabel(0.001)).toBe('~50 m away')
  })
  it('uses one decimal for km distances', () => {
    expect(distanceLabel(1.234)).toBe('~1.2 km away')
  })
})
