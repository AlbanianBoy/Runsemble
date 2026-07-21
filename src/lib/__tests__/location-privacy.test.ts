import { describe, it, expect } from 'vitest'
import { fuzzCoordForUser } from '@/lib/location-privacy'
import { haversineKm } from '@/lib/geo'

// The per-user grid is a privacy control, so these assert the properties it is
// supposed to have rather than the numbers it happens to produce today.

const HOME = { lat: 51.2194, lng: 4.4025 } // Antwerp centre
const CELL_M = 200

describe('fuzzCoordForUser', () => {
  it('is stable for the same user and point', () => {
    // The whole reason the offset never rotates: repeated observation of the
    // same person must yield the same answer, or an attacker could average
    // many samples and converge on the true position.
    const a = fuzzCoordForUser(HOME, 'user-1', CELL_M)
    const b = fuzzCoordForUser(HOME, 'user-1', CELL_M)
    expect(a).toEqual(b)
  })

  it('moves the point by less than the cell size', () => {
    const out = fuzzCoordForUser(HOME, 'user-1', CELL_M)
    // Snapping to a grid displaces by at most half a cell per axis, so the
    // corner-to-corner worst case is (√2/2)·cell ≈ 141m. Assert the honest
    // bound the UI promises — "roughly 200m" — rather than the exact figure.
    expect(haversineKm(HOME, out) * 1000).toBeLessThan(CELL_M)
  })

  it('gives different users different grids', () => {
    const a = fuzzCoordForUser(HOME, 'user-1', CELL_M)
    const b = fuzzCoordForUser(HOME, 'user-2', CELL_M)
    expect(a.lat === b.lat && a.lng === b.lng).toBe(false)
  })

  it('does not collapse a whole neighbourhood onto one point', () => {
    // Sanity check that this is still a grid and not a hash: distinct people
    // spread over a few streets must not all land on the same coordinate.
    const points = Array.from({ length: 12 }, (_, i) =>
      fuzzCoordForUser({ lat: HOME.lat + i * 0.0004, lng: HOME.lng }, 'user-1', CELL_M)
    )
    expect(new Set(points.map((p) => `${p.lat},${p.lng}`)).size).toBeGreaterThan(1)
  })

  it('still snaps: two points inside one cell agree', () => {
    // A few metres apart must usually resolve to the same cell — that is what
    // stops the pin twitching as GPS drifts. Walk a metre at a time across a
    // full cell and confirm the output takes only a small number of values.
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const p = fuzzCoordForUser(
        { lat: HOME.lat + i * 0.000018, lng: HOME.lng }, // ~2m steps, ~200m total
        'user-1',
        CELL_M
      )
      seen.add(`${p.lat},${p.lng}`)
    }
    // Crossing at most one boundary over one cell's width.
    expect(seen.size).toBeLessThanOrEqual(2)
  })

  it('offsets latitude and longitude independently', () => {
    // If both axes shared one random fraction the displacement would always sit
    // on a diagonal, which halves the effective uncertainty.
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`)
    const sameSign = ids.filter((id) => {
      const p = fuzzCoordForUser(HOME, id, CELL_M)
      return Math.sign(p.lat - HOME.lat) === Math.sign(p.lng - HOME.lng)
    }).length
    // Independent axes land on the diagonal about half the time; a fixed
    // relationship would make this 0 or 40.
    expect(sameSign).toBeGreaterThan(5)
    expect(sameSign).toBeLessThan(35)
  })
})
