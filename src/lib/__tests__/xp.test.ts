import { describe, it, expect } from 'vitest'
import { computeStreak } from '@/lib/xp'

// computeStreak drives the streak gamification — the rules people will argue
// about if they're wrong. Day keys are Europe/Brussels days, "YYYY-MM-DD".
//
// Test instants are explicit UTC middays rather than `new Date(y, m, d)`: local
// midnight lands on a different Brussels date depending on where the machine
// running the tests happens to be, so it made the suite pass or fail by
// geography. Midday UTC is the same Brussels day everywhere.
const JULY_6 = new Date('2026-07-06T12:00:00Z') // Monday

describe('computeStreak', () => {
  it('starts a streak on the very first run', () => {
    const r = computeStreak(null, 0, 0, JULY_6)
    expect(r.streak).toBe(1)
    expect(r.longestStreak).toBe(1)
    expect(r.incremented).toBe(true)
    expect(r.lastActiveDate).toBe('2026-07-06')
  })

  it('does not double-count two runs on the same day', () => {
    const r = computeStreak('2026-07-06', 4, 10, JULY_6)
    expect(r.streak).toBe(4)
    expect(r.longestStreak).toBe(10)
    expect(r.incremented).toBe(false)
  })

  it('reads day keys stored before zero-padding', () => {
    // Older rows hold "2026-7-5"; daysBetween parses both, so a streak written
    // by the previous version must not break on the first run after deploy.
    const r = computeStreak('2026-7-5', 4, 4, JULY_6)
    expect(r.streak).toBe(5)
  })

  it('treats a same-day run with a zero streak as day 1', () => {
    const r = computeStreak('2026-07-06', 0, 0, JULY_6)
    expect(r.streak).toBe(1)
  })

  it('increments when the last run was yesterday', () => {
    const r = computeStreak('2026-07-05', 4, 4, JULY_6)
    expect(r.streak).toBe(5)
    expect(r.longestStreak).toBe(5) // new personal best
    expect(r.incremented).toBe(true)
    expect(r.usedGrace).toBe(false)
  })

  it('forgives a single rest day and says so', () => {
    // Ran Saturday, rested Sunday, ran Monday. Rest days are training, not
    // failure — the streak survives, and the result flags that it was spent.
    const r = computeStreak('2026-07-04', 9, 9, JULY_6)
    expect(r.streak).toBe(10)
    expect(r.usedGrace).toBe(true)
  })

  it('breaks on two consecutive missed days', () => {
    const r = computeStreak('2026-07-03', 14, 14, JULY_6) // 3-day gap
    expect(r.streak).toBe(1)
    expect(r.longestStreak).toBe(14)
    expect(r.usedGrace).toBe(false)
  })

  it('keeps the old longest streak when the new one is shorter', () => {
    const r = computeStreak('2026-07-05', 2, 30, JULY_6)
    expect(r.streak).toBe(3)
    expect(r.longestStreak).toBe(30)
  })

  it('resets to 1 after a long gap', () => {
    const r = computeStreak('2026-07-01', 14, 14, JULY_6) // 5-day gap
    expect(r.streak).toBe(1)
    expect(r.longestStreak).toBe(14)
    expect(r.incremented).toBe(true)
  })

  it('increments across a month boundary', () => {
    const r = computeStreak('2026-06-30', 7, 7, new Date('2026-07-01T12:00:00Z'))
    expect(r.streak).toBe(8)
  })

  it('files a run just after local midnight under the new local day', () => {
    // 00:30 in Antwerp on 7 July is 22:30 UTC on 6 July. Under server time this
    // was filed as the 6th, so a second late-night run in a row didn't count.
    const justAfterMidnight = new Date('2026-07-06T22:30:00Z')
    const r = computeStreak('2026-07-06', 3, 3, justAfterMidnight)
    expect(r.lastActiveDate).toBe('2026-07-07')
    expect(r.streak).toBe(4)
  })
})
