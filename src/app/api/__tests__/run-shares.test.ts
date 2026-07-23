import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── The live-share routes, where the dangerous behaviour is the state machine ─
// The pure lifecycle rules (who may see a position, in which state) are tested
// in lib/__tests__/run-share.test.ts. What is tested HERE is the thing those
// can't reach: that the routes touch the database the right number of times, in
// the right direction. A share that gets minted twice, an SOS whose timestamp
// resets on re-arm, or a beacon that errors instead of reporting "there's
// nothing to ping" are all bugs that only show up at the route seam.

let overrides: DbOverrides = {}
const { db } = makeDb(
  new Proxy({} as DbOverrides, {
    get: (_t, k: string) => overrides[k],
    has: (_t, k: string) => k in overrides,
    ownKeys: () => Reflect.ownKeys(overrides),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
)
vi.mock('@/lib/db', () => ({ db }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

// Allow every request through the limiter — the limiter itself is tested
// elsewhere, and here it would just add noise. userKey/clientIp stay real.
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: vi.fn(async () => true),
}))

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue({ id: 'me', name: 'Arian Behrami' })
  overrides = {}
})

describe('POST /api/run-shares', () => {
  it('mints a new share when none is live — 201, created:true', async () => {
    const create = vi.fn(async () => ({ id: 's1', token: 'tok', expiresAt: new Date(), sosAt: null }))
    overrides = {
      'runShare.findFirst': () => null, // nothing active
      'runShare.create': create,
    }
    const { POST } = await import('@/app/api/run-shares/route')
    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.created).toBe(true)
    expect(create).toHaveBeenCalledOnce()
  })

  it('hands back the existing share instead of a second one — 200, created:false, no create', async () => {
    const create = vi.fn()
    overrides = {
      'runShare.findFirst': () => ({ id: 's1', token: 'existing', expiresAt: new Date(), sosAt: null }),
      'runShare.create': create,
    }
    const { POST } = await import('@/app/api/run-shares/route')
    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.created).toBe(false)
    expect(body.share.token).toBe('existing')
    // The whole point of "one active share per runner": no second row.
    expect(create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/run-shares', () => {
  it('reports how many it ended, and 0 is a success not a 404', async () => {
    overrides = { 'runShare.updateMany': () => ({ count: 0 }) }
    const { DELETE } = await import('@/app/api/run-shares/route')
    const res = await DELETE()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ended: 0 })
  })

  it('ends the run (endedAt) without revoking it — a normal finish is not "cut off"', async () => {
    const updateMany = vi.fn((..._args: unknown[]) => Promise.resolve({ count: 1 }))
    overrides = { 'runShare.updateMany': updateMany }
    const { DELETE } = await import('@/app/api/run-shares/route')
    await DELETE()

    const arg = updateMany.mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(arg.data).toHaveProperty('endedAt')
    expect(arg.data).not.toHaveProperty('revokedAt')
  })
})

describe('POST /api/run-shares/beacon', () => {
  const beaconReq = (body: unknown) =>
    new NextRequest('http://localhost/api/run-shares/beacon', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  const validFix = { lat: 51.21, lng: 4.41, accuracyM: 8, distanceKm: 2.4, durationSec: 900 }

  it('returns { active: 0 } when nothing is live — never an error', async () => {
    overrides = { 'runShare.updateMany': () => ({ count: 0 }) }
    const { POST } = await import('@/app/api/run-shares/beacon/route')
    const res = await POST(beaconReq(validFix))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ active: 0 })
  })

  it('refuses an out-of-range coordinate — 400 invalid_value', async () => {
    const { POST } = await import('@/app/api/run-shares/beacon/route')
    const res = await POST(beaconReq({ ...validFix, lat: 200 }))

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_value')
  })

  it('raises SOS as a second update guarded on sosAt:null, so re-arming never moves the time', async () => {
    const updateMany = vi.fn((..._args: unknown[]) => Promise.resolve({ count: 1 }))
    overrides = { 'runShare.updateMany': updateMany }
    const { POST } = await import('@/app/api/run-shares/beacon/route')
    await POST(beaconReq({ ...validFix, sos: true }))

    expect(updateMany).toHaveBeenCalledTimes(2)
    const sosCall = updateMany.mock.calls[1]![0] as { where: Record<string, unknown>; data: Record<string, unknown> }
    expect(sosCall.where.sosAt).toBeNull()
    expect(sosCall.data).toHaveProperty('sosAt')
  })

  it('does not run the SOS update when there is no active share to attach it to', async () => {
    const updateMany = vi.fn(async () => ({ count: 0 })) // nothing active
    overrides = { 'runShare.updateMany': updateMany }
    const { POST } = await import('@/app/api/run-shares/beacon/route')
    await POST(beaconReq({ ...validFix, sos: true }))

    // Only the position update ran; the SOS update is skipped on count 0.
    expect(updateMany).toHaveBeenCalledOnce()
  })
})

describe('GET /api/run-shares/[token] (public)', () => {
  const params = (token: string) => ({ params: Promise.resolve({ token }) })
  const req = () => new NextRequest('http://localhost/api/run-shares/abc')

  it('404s an unknown token with no hint that it never existed', async () => {
    overrides = { 'runShare.findUnique': () => null }
    const { GET } = await import('@/app/api/run-shares/[token]/route')
    const res = await GET(req(), params('nope'))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('That link is no longer active')
  })

  it('serves a live share with no-store and noindex headers', async () => {
    overrides = {
      'runShare.findUnique': () => ({
        expiresAt: new Date(Date.now() + 3_600_000),
        endedAt: null,
        revokedAt: null,
        lastPingAt: new Date(),
        sosAt: null,
        lat: 51.21,
        lng: 4.41,
        accuracyM: 8,
        distanceKm: 2.4,
        durationSec: 900,
        createdAt: new Date(),
        user: { name: 'Arian Behrami', avatar: null },
      }),
    }
    const { GET } = await import('@/app/api/run-shares/[token]/route')
    const res = await GET(req(), params('realtoken'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    // First name only — the surname must not survive the projection.
    expect(body.runner.name).toBe('Arian')
    expect(JSON.stringify(body)).not.toContain('Behrami')
    // A live share shows its position.
    expect(body.position).not.toBeNull()
  })
})
