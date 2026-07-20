import { describe, it, expect } from 'vitest'
import { CURRENT_POLICY_VERSION, MIN_AGE, needsReconsent, isOldEnough } from '@/lib/consent'

describe('consent versioning', () => {
  it('exposes a date-shaped policy version', () => {
    expect(CURRENT_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('accepts a user on the current policy', () => {
    expect(needsReconsent(CURRENT_POLICY_VERSION)).toBe(false)
  })

  it('flags a user on an older policy', () => {
    expect(needsReconsent('2020-01-01')).toBe(true)
  })

  it('flags accounts that predate version tracking', () => {
    // consentAt was set, consentVersion never was — we cannot prove what they
    // agreed to, so they count as needing to be asked again.
    expect(needsReconsent(null)).toBe(true)
    expect(needsReconsent(undefined)).toBe(true)
  })
})

describe('age gate (isOldEnough)', () => {
  const today = new Date('2026-07-20')

  it('accepts someone comfortably over the minimum age', () => {
    expect(isOldEnough('2000-01-01', today)).toBe(true)
  })

  it('accepts someone who is exactly the minimum age today', () => {
    const born = new Date(today)
    born.setFullYear(born.getFullYear() - MIN_AGE)
    expect(isOldEnough(born, today)).toBe(true)
  })

  it('rejects someone one day short of the minimum age', () => {
    const born = new Date(today)
    born.setFullYear(born.getFullYear() - MIN_AGE)
    born.setDate(born.getDate() + 1) // birthday is tomorrow → still MIN_AGE-1 today
    expect(isOldEnough(born, today)).toBe(false)
  })

  it('fails closed on missing, unparseable, or future dates', () => {
    expect(isOldEnough(null, today)).toBe(false)
    expect(isOldEnough(undefined, today)).toBe(false)
    expect(isOldEnough('', today)).toBe(false)
    expect(isOldEnough('not-a-date', today)).toBe(false)
    expect(isOldEnough('2030-01-01', today)).toBe(false) // future
  })
})
