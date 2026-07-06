import { describe, it, expect } from 'vitest'
import { computeStreak } from '@/lib/xp'

// computeStreak drives the streak gamification — the rules people will argue
// about if they're wrong. Day keys are local-time "Y-M-D" strings.
const JULY_6 = new Date(2026, 6, 6) // Mon 6 Jul 2026 (months are 0-based)

describe('computeStreak', () => {
  it('starts a streak on the very first run', () => {
    const r = computeStreak(null, 0, 0, JULY_6)
    expect(r.streak).toBe(1)
    expect(r.longestStreak).toBe(1)
    expect(r.incremented).toBe(true)
    expect(r.lastActiveDate).toBe('2026-7-6')
  })

  it('does not double-count two runs on the same day', () => {
    const r = computeStreak('2026-7-6', 4, 10, JULY_6)
    expect(r.streak).toBe(4)
    expect(r.longestStreak).toBe(10)
    expect(r.incremented).toBe(false)
  })

  it('treats a same-day run with a zero streak as day 1', () => {
    const r = computeStreak('2026-7-6', 0, 0, JULY_6)
    expect(r.streak).toBe(1)
  })

  it('increments when the last run was yesterday', () => {
    const r = computeStreak('2026-7-5', 4, 4, JULY_6)
    expect(r.streak).toBe(5)
    expect(r.longestStreak).toBe(5) // new personal best
    expect(r.incremented).toBe(true)
  })

  it('keeps the old longest streak when the new one is shorter', () => {
    const r = computeStreak('2026-7-5', 2, 30, JULY_6)
    expect(r.streak).toBe(3)
    expect(r.longestStreak).toBe(30)
  })

  it('resets to 1 after a gap', () => {
    const r = computeStreak('2026-7-2', 14, 14, JULY_6) // 4-day gap
    expect(r.streak).toBe(1)
    expect(r.longestStreak).toBe(14)
    expect(r.incremented).toBe(true)
  })

  it('increments across a month boundary', () => {
    const r = computeStreak('2026-6-30', 7, 7, new Date(2026, 6, 1))
    expect(r.streak).toBe(8)
  })
})
