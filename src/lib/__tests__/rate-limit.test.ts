import { describe, it, expect, vi, afterEach } from 'vitest'
import { rateLimit, clientIp } from '@/lib/rate-limit'

afterEach(() => vi.useRealTimers())

describe('rateLimit', () => {
  it('allows up to the limit, then blocks within the window', () => {
    const key = `t-${Math.random()}`
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(false)
    expect(rateLimit(key, 3, 60_000)).toBe(false)
  })

  it('resets after the window passes', () => {
    vi.useFakeTimers()
    const key = `t-${Math.random()}`
    expect(rateLimit(key, 1, 1000)).toBe(true)
    expect(rateLimit(key, 1, 1000)).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(rateLimit(key, 1, 1000)).toBe(true)
  })

  it('keys are independent', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    expect(rateLimit(a, 1, 60_000)).toBe(true)
    expect(rateLimit(a, 1, 60_000)).toBe(false)
    expect(rateLimit(b, 1, 60_000)).toBe(true) // b unaffected by a
  })
})

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(clientIp(req)).toBe('1.2.3.4')
  })
  it('falls back to a constant when no ip headers', () => {
    expect(clientIp(new Request('http://x'))).toBe('unknown')
  })
})
