import { describe, it, expect } from 'vitest'
import { isInsideSafeZone, clampZoneRadius, MIN_ZONE_RADIUS_M, MAX_ZONE_RADIUS_M } from '@/lib/safe-zones'
import { toPublicUser } from '@/lib/public-user'

// ─── Safe zones ───────────────────────────────────────────────────────────────
// Two failure directions, both bad: leak where someone lives, or make someone
// invisible everywhere by accident. Both sides get pinned.

const HOME = { lat: 51.2194, lng: 4.4025, radiusM: 500 } // central Antwerp

describe('isInsideSafeZone', () => {
  it('is true at the centre', () => {
    expect(isInsideSafeZone({ lat: HOME.lat, lng: HOME.lng }, [HOME])).toBe(true)
  })

  it('is true just inside the radius', () => {
    // ~0.004° lat ≈ 445m < 500m.
    expect(isInsideSafeZone({ lat: HOME.lat + 0.004, lng: HOME.lng }, [HOME])).toBe(true)
  })

  it('is false just outside the radius', () => {
    // ~0.006° lat ≈ 667m > 500m.
    expect(isInsideSafeZone({ lat: HOME.lat + 0.006, lng: HOME.lng }, [HOME])).toBe(false)
  })

  it('is false with no zones — nobody is hidden by default', () => {
    expect(isInsideSafeZone({ lat: HOME.lat, lng: HOME.lng }, [])).toBe(false)
  })

  it('any one of several zones is enough', () => {
    const work = { lat: 51.26, lng: 4.42, radiusM: 300 }
    expect(isInsideSafeZone({ lat: 51.26, lng: 4.42 }, [HOME, work])).toBe(true)
  })
})

describe('clampZoneRadius', () => {
  it('clamps into the allowed band instead of rejecting', () => {
    expect(clampZoneRadius(5)).toBe(MIN_ZONE_RADIUS_M)
    expect(clampZoneRadius(999_999)).toBe(MAX_ZONE_RADIUS_M)
    expect(clampZoneRadius(750)).toBe(750)
  })

  it('falls back to a sane default for junk', () => {
    expect(clampZoneRadius('a house')).toBe(500)
    expect(clampZoneRadius(undefined)).toBe(500)
  })
})

// ─── The projection is where the promise is kept ──────────────────────────────

const ROW = {
  id: 'u1', name: 'Maya', avatar: null, bio: null, city: 'Antwerp',
  lat: HOME.lat, lng: HOME.lng, gender: null, verified: false,
  preferredSport: 'running', paceLevel: 'beginner', schedulePreference: '',
  xp: 0, streak: 0, longestStreak: 0, totalRuns: 0, totalPeopleRunWith: 0,
  totalDistanceKm: 0, totalDurationSec: 0, isAvailable: true,
  availableFrom: null, availableUntil: null, privacyVisible: true,
  createdAt: new Date(),
}

describe('toPublicUser with safe zones', () => {
  it('shares no location at all while inside a zone', () => {
    const out = toPublicUser({ ...ROW, safeZones: [HOME] })
    expect(out.lat).toBeNull()
    expect(out.lng).toBeNull()
  })

  it('shares the fuzzed location as before when outside every zone', () => {
    const far = { lat: 51.3, lng: 4.6, radiusM: 500 }
    const out = toPublicUser({ ...ROW, safeZones: [far] })
    expect(out.lat).not.toBeNull()
    expect(out.lng).not.toBeNull()
  })

  it('behaves exactly as before for a user with no zones', () => {
    const out = toPublicUser({ ...ROW, safeZones: [] })
    expect(out.lat).not.toBeNull()
  })

  // The other leak: the zone centre IS the home address. Whatever a route
  // includes, the public payload must never carry the zones themselves.
  it('never ships the safeZones key in a public payload', () => {
    const out = toPublicUser({ ...ROW, safeZones: [HOME] })
    expect('safeZones' in out).toBe(false)
    expect(JSON.stringify(out)).not.toContain('radiusM')
  })

  it('suppression decides on EXACT coordinates, not the fuzzed ones', () => {
    // A point ~450m from the zone centre: inside the 500m zone. If the check ran
    // on fuzzed coords, the ~200m snap could bounce it outside and leak a pin at
    // the zone's edge — nondeterministically. Inside must mean inside, always.
    const edge = { ...ROW, lat: HOME.lat + 0.004, lng: HOME.lng, safeZones: [HOME] }
    for (let i = 0; i < 5; i++) expect(toPublicUser(edge).lat).toBeNull()
  })
})
