import { describe, it, expect } from 'vitest'
import { CURRENT_POLICY_VERSION, needsReconsent } from '@/lib/consent'

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
