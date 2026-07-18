import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── /api/safe-zones ──────────────────────────────────────────────────────────
// A zone centre is a home address. The invariants worth pinning: everything is
// session-scoped, the cap holds, and deletion can't cross accounts.

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

const ME = { id: 'u1', name: 'Arian', email: 'a@b.c' }

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/safe-zones', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(ME)
  overrides = {
    'safeZone.count': () => 0,
    'safeZone.create': (a: unknown) => ({ id: 'z1', ...(a as { data: object }).data }),
  }
})

describe('POST /api/safe-zones', () => {
  it('creates a zone for the caller', async () => {
    let data: { userId?: string; radiusM?: number } = {}
    overrides['safeZone.create'] = (a: unknown) => ((data = (a as { data: typeof data }).data), { id: 'z1' })

    const { POST } = await import('@/app/api/safe-zones/route')
    const res = await POST(post({ lat: 51.2194, lng: 4.4025, name: 'Home', radiusM: 500 }))

    expect(res.status).toBe(201)
    expect(data.userId).toBe('u1') // always the session user, never from the body
  })

  it('is 401 for an anonymous caller', async () => {
    getSessionUser.mockResolvedValue(null)
    const { POST } = await import('@/app/api/safe-zones/route')
    expect((await POST(post({ lat: 51, lng: 4 }))).status).toBe(401)
  })

  it('rejects junk coordinates', async () => {
    const { POST } = await import('@/app/api/safe-zones/route')
    expect((await POST(post({ lat: 'here', lng: 4 }))).status).toBe(400)
    expect((await POST(post({ lat: 91, lng: 4 }))).status).toBe(400)
    expect((await POST(post({}))).status).toBe(400)
  })

  it('clamps an absurd radius instead of storing it', async () => {
    let data: { radiusM?: number } = {}
    overrides['safeZone.create'] = (a: unknown) => ((data = (a as { data: typeof data }).data), { id: 'z1' })

    const { POST } = await import('@/app/api/safe-zones/route')
    await POST(post({ lat: 51.2, lng: 4.4, radiusM: 50_000 }))
    expect(data.radiusM).toBe(2000)
  })

  it('enforces the per-user cap', async () => {
    overrides['safeZone.count'] = () => 5
    const { POST } = await import('@/app/api/safe-zones/route')
    expect((await POST(post({ lat: 51.2, lng: 4.4 }))).status).toBe(400)
  })
})

describe('DELETE /api/safe-zones/[id]', () => {
  const del = () => new NextRequest('http://localhost/api/safe-zones/z1', { method: 'DELETE' })
  const params = Promise.resolve({ id: 'z1' })

  it("deletes only when the zone belongs to the caller — another user's id is a 404", async () => {
    let where: unknown = null
    overrides['safeZone.deleteMany'] = (a: unknown) => {
      where = (a as { where: unknown }).where
      return { count: 0 } // scoped query matched nothing → not yours
    }

    const { DELETE } = await import('@/app/api/safe-zones/[id]/route')
    const res = await DELETE(del(), { params })

    expect(where).toEqual({ id: 'z1', userId: 'u1' }) // the scoping IS the security
    expect(res.status).toBe(404)
  })

  it('deletes your own zone', async () => {
    overrides['safeZone.deleteMany'] = () => ({ count: 1 })
    const { DELETE } = await import('@/app/api/safe-zones/[id]/route')
    expect((await DELETE(del(), { params })).status).toBe(200)
  })
})
