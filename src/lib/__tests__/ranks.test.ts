import { describe, it, expect } from 'vitest'
import { getRankFromXP, RANK_TIERS } from '@/lib/ranks'

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
    expect(r.progress).toBe(1)
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
