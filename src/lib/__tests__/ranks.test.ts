import { describe, it, expect } from 'vitest'
import { getRankFromXP, RANK_TIERS, ELITE_PRESTIGE_WINDOW } from '@/lib/ranks'

describe('getRankFromXP', () => {
  it('starts everyone at Starter', () => {
    const r = getRankFromXP(0)
    expect(r.tier).toBe('Starter')
    expect(r.progress).toBe(0)
    expect(r.isMax).toBe(false)
  })

  it('promotes exactly at each tier boundary', () => {
    expect(getRankFromXP(99).tier).toBe('Starter')
    expect(getRankFromXP(100).tier).toBe('Jogger')
    expect(getRankFromXP(299).tier).toBe('Jogger')
    expect(getRankFromXP(300).tier).toBe('Pacer')
    expect(getRankFromXP(600).tier).toBe('Regular')
    expect(getRankFromXP(1000).tier).toBe('Runsemble')
    expect(getRankFromXP(2000).tier).toBe('Elite Ensemble')
  })

  it('reports progress through the current tier', () => {
    // Pacer spans 300..600 → 450 is halfway.
    expect(getRankFromXP(450).progress).toBeCloseTo(0.5)
    expect(getRankFromXP(450).nextTierXP).toBe(600)
  })

  it('caps at the top tier', () => {
    const r = getRankFromXP(999_999)
    expect(r.tier).toBe('Elite Ensemble')
    expect(r.isMax).toBe(true)
    // progress cycles through ELITE_PRESTIGE_WINDOW — must be in [0, 1)
    expect(r.progress).toBeGreaterThanOrEqual(0)
    expect(r.progress).toBeLessThan(1)
    // xpBeyondMax is the raw surplus above the Elite floor
    expect(r.xpBeyondMax).toBe(999_999 - 2000)
  })

  it('progress is 0 at the exact Elite Ensemble floor (fresh prestige window)', () => {
    const r = getRankFromXP(2000)
    expect(r.tier).toBe('Elite Ensemble')
    expect(r.isMax).toBe(true)
    expect(r.progress).toBe(0)
    expect(r.xpBeyondMax).toBe(0)
  })

  it('progress is 0.5 halfway through a prestige window', () => {
    const r = getRankFromXP(2000 + ELITE_PRESTIGE_WINDOW / 2)
    expect(r.progress).toBeCloseTo(0.5)
    expect(r.xpBeyondMax).toBe(ELITE_PRESTIGE_WINDOW / 2)
  })

  it('xpBeyondMax is null for non-max tiers', () => {
    expect(getRankFromXP(0).xpBeyondMax).toBeNull()
    expect(getRankFromXP(1500).xpBeyondMax).toBeNull()
  })

  it('never crashes on garbage XP', () => {
    expect(getRankFromXP(-50).tier).toBe('Starter')
    expect(getRankFromXP(NaN).tier).toBe('Starter')
    expect(getRankFromXP(Infinity).tier).toBe('Starter')
  })

  it('keeps tiers sorted ascending (data sanity)', () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i].minXP).toBeGreaterThan(RANK_TIERS[i - 1].minXP)
    }
  })
})
