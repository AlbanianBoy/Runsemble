import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, rateLimitBackend, userKey, clientIp } from '@/lib/rate-limit'

// The backend is chosen from env at call time, so every test states which world
// it is in rather than inheriting whatever the shell exported.
const REDIS_ENV = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
]
const clearRedisEnv = () => REDIS_ENV.forEach((k) => delete process.env[k])

// The in-memory buckets are module state and outlive a test, so keys are unique.
let seq = 0
const k = (name: string) => `test:${name}:${seq++}`

beforeEach(() => {
  clearRedisEnv()
  vi.restoreAllMocks()
})
afterEach(() => {
  clearRedisEnv()
  vi.useRealTimers()
})

describe('backend selection', () => {
  it('falls back to in-memory when no store is configured', () => {
    expect(rateLimitBackend()).toBe('in-memory')
  })

  it('uses redis when the Upstash pair is set', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok'
    expect(rateLimitBackend()).toBe('redis')
  })

  it('accepts the Vercel KV names too', () => {
    process.env.KV_REST_API_URL = 'https://example.kv.vercel-storage.com'
    process.env.KV_REST_API_TOKEN = 'tok'
    expect(rateLimitBackend()).toBe('redis')
  })

  it('needs both halves — a url with no token is not a configured store', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    expect(rateLimitBackend()).toBe('in-memory')
  })
})

describe('in-memory limiter', () => {
  it('allows up to the limit, then blocks within the window', async () => {
    const key = k('burst')
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(key, 3, 60_000)).toBe(true)
    expect(await checkRateLimit(key, 3, 60_000)).toBe(false)
    expect(await checkRateLimit(key, 3, 60_000)).toBe(false)
  })

  it('resets after the window passes', async () => {
    const key = k('window')
    expect(await checkRateLimit(key, 1, 20)).toBe(true)
    expect(await checkRateLimit(key, 1, 20)).toBe(false)
    await new Promise((r) => setTimeout(r, 30))
    expect(await checkRateLimit(key, 1, 20)).toBe(true)
  })

  it('keys are independent', async () => {
    const a = k('a')
    const b = k('b')
    expect(await checkRateLimit(a, 1, 60_000)).toBe(true)
    expect(await checkRateLimit(a, 1, 60_000)).toBe(false)
    expect(await checkRateLimit(b, 1, 60_000)).toBe(true) // b unaffected by a
  })
})

describe('redis limiter', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok'
  })

  const reply = (count: number) =>
    new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 })
  const bodyOf = (spy: ReturnType<typeof vi.spyOn>) =>
    JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body))

  it('allows while the count is within the limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(5))
    expect(await checkRateLimit('k', 5, 60_000)).toBe(true)
  })

  it('blocks as soon as the count passes the limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(6))
    expect(await checkRateLimit('k', 5, 60_000)).toBe(false)
  })

  it('sets the TTL only when the key is new', async () => {
    // EXPIRE without NX on every request slides the window forward, so a steady
    // caller would never see it reset and could be shut out permanently.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(1))
    await checkRateLimit('k', 5, 60_000)
    const body = bodyOf(spy)
    expect(body[0]).toEqual(['INCR', 'k'])
    expect(body[1]).toEqual(['EXPIRE', 'k', '60', 'NX'])
  })

  it('rounds a sub-second window up rather than asking for a 0s TTL', async () => {
    // EXPIRE 0 deletes the key immediately, which would mean no limit at all.
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(1))
    await checkRateLimit('k', 5, 200)
    expect(bodyOf(spy)[1][2]).toBe('1')
  })

  it('strips a trailing slash so the pipeline url is not doubled', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io/'
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(1))
    await checkRateLimit('k', 5, 60_000)
    expect(spy.mock.calls[0]![0]).toBe('https://example.upstash.io/pipeline')
  })

  // Failing open is the deliberate choice: a limiter that 500s the site when
  // Redis blinks has turned a spam problem into an outage. The log is the signal
  // that the control is currently off.
  it('fails open when the store is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await checkRateLimit('k', 1, 60_000)).toBe(true)
  })

  it('fails open on a non-200 from the store', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    expect(await checkRateLimit('k', 1, 60_000)).toBe(true)
  })

  it('fails open when the store answers without a usable count', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ error: 'WRONGTYPE' }]), { status: 200 })
    )
    expect(await checkRateLimit('k', 1, 60_000)).toBe(true)
  })
})

describe('keys', () => {
  it('scopes an authenticated action to the account, not the address', () => {
    // A sender on mobile data changes IP for free, and a whole office shares one.
    expect(userKey('dm', 'u1')).toBe('dm:u:u1')
    expect(userKey('dm', 'u1')).not.toBe(userKey('dm', 'u2'))
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
