import { describe, it, expect } from 'vitest'
import { toPublicUser } from '@/lib/public-user'
import { fuzzCoord } from '@/lib/geo'

const baseUser = {
  id: 'u1',
  name: 'Test Runner',
  email: 'secret@example.com',
  passwordHash: 'salt:hash',
  consentAt: new Date('2026-01-01'),
  emailVerifiedAt: new Date('2026-01-02'),
  lastActiveDate: '2026-07-01',
  avatar: null,
  bio: null,
  city: 'Antwerp',
  lat: 51.21234,
  lng: 4.41987,
  gender: null,
  verified: false,
  preferredSport: 'running',
  paceLevel: 'beginner',
  schedulePreference: 'evening',
  xp: 100,
  streak: 2,
  longestStreak: 5,
  totalRuns: 3,
  totalPeopleRunWith: 1,
  totalDistanceKm: 12.5,
  totalDurationSec: 4000,
  isAvailable: true,
  availableFrom: null,
  availableUntil: null,
  privacyVisible: true,
  createdAt: new Date('2026-06-01'),
}

describe('toPublicUser (what one user may see about another)', () => {
  it('never exposes credentials or contact PII', () => {
    const pub = toPublicUser(baseUser) as Record<string, unknown>
    expect(pub.passwordHash).toBeUndefined()
    expect(pub.email).toBeUndefined()
    expect(pub.consentAt).toBeUndefined()
    expect(pub.emailVerifiedAt).toBeUndefined()
    expect(pub.lastActiveDate).toBeUndefined()
  })

  it('snaps coordinates to the privacy grid instead of exact position', () => {
    const pub = toPublicUser(baseUser)
    const expected = fuzzCoord({ lat: baseUser.lat, lng: baseUser.lng }, 200)
    expect(pub.lat).toBe(expected.lat)
    expect(pub.lng).toBe(expected.lng)
    // And the exact coordinate is actually gone (grid-snapped, not passed through).
    expect(pub.lat).not.toBe(baseUser.lat)
  })

  it('shares no location at all when the profile is hidden', () => {
    const pub = toPublicUser({ ...baseUser, privacyVisible: false })
    expect(pub.lat).toBeNull()
    expect(pub.lng).toBeNull()
  })

  it('handles users without coordinates', () => {
    const pub = toPublicUser({ ...baseUser, lat: null, lng: null })
    expect(pub.lat).toBeNull()
    expect(pub.lng).toBeNull()
  })

  it('keeps the public profile fields and passes relations through', () => {
    const withRelations = { ...baseUser, earnedBadges: [{ id: 'b1' }] }
    const pub = toPublicUser(withRelations) as Record<string, unknown>
    expect(pub.name).toBe('Test Runner')
    expect(pub.xp).toBe(100)
    expect(pub.earnedBadges).toEqual([{ id: 'b1' }])
  })
})
