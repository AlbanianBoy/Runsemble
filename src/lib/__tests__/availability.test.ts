import { describe, it, expect } from 'vitest'
import { isAvailableNow, isComingUp, SCHEDULED_WINDOW_MIN } from '@/lib/availability'

const NOW = new Date('2026-07-06T17:00:00.000Z')
const mins = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString()

describe('isAvailableNow', () => {
  it('is true when explicitly available', () => {
    expect(isAvailableNow({ isAvailable: true }, NOW)).toBe(true)
  })
  it('honours availableUntil: a live window is available', () => {
    expect(isAvailableNow({ isAvailable: true, availableUntil: mins(30) }, NOW)).toBe(true)
  })
  it('honours availableUntil: an expired window is NOT available (stale pin clears reader-side)', () => {
    expect(isAvailableNow({ isAvailable: true, availableUntil: mins(-1) }, NOW)).toBe(false)
  })
  it('is false with no schedule and not available', () => {
    expect(isAvailableNow({ isAvailable: false }, NOW)).toBe(false)
  })
  it('auto-activates a scheduled slot once its time arrives', () => {
    expect(isAvailableNow({ isAvailable: false, availableFrom: mins(-10) }, NOW)).toBe(true)
  })
  it('expires the scheduled window after SCHEDULED_WINDOW_MIN', () => {
    expect(isAvailableNow({ isAvailable: false, availableFrom: mins(-SCHEDULED_WINDOW_MIN - 1) }, NOW)).toBe(false)
  })
  it('is not live before the scheduled time', () => {
    expect(isAvailableNow({ isAvailable: false, availableFrom: mins(90) }, NOW)).toBe(false)
  })
  it('survives garbage dates', () => {
    expect(isAvailableNow({ isAvailable: false, availableFrom: 'not a date' }, NOW)).toBe(false)
  })
})

describe('isComingUp', () => {
  it('is true for a future slot', () => {
    expect(isComingUp({ isAvailable: false, availableFrom: mins(90) }, NOW)).toBe(true)
  })
  it('is false once the slot has started', () => {
    expect(isComingUp({ isAvailable: false, availableFrom: mins(-5) }, NOW)).toBe(false)
  })
  it('is false with no schedule', () => {
    expect(isComingUp({ isAvailable: false }, NOW)).toBe(false)
    expect(isComingUp({ isAvailable: false, availableFrom: null }, NOW)).toBe(false)
  })
})
