import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb } from './helpers/mock-db'

// ─── Bad input is a 400, not a 500 ────────────────────────────────────────────
// paceLevel and friends are database enums now. Postgres rejecting a bad value is
// right, but it surfaces as a Prisma error — a 500 — for what is plainly a bad
// request. So the routes check the same value sets first. If that check is ever
// dropped, the route still "works" (the write just fails differently), and only
// the status code betrays it. Hence these.

const { db } = makeDb({
  'user.findUnique': () => ({ id: 'u1', name: 'Arian', email: 'a@b.c' }),
  'user.update': () => ({ id: 'u1', name: 'Arian', email: 'a@b.c', earnedBadges: [], groupMemberships: [] }),
  'feedPost.create': () => ({ id: 'p1', content: 'hello' }),
})
vi.mock('@/lib/db', () => ({ db }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

const ME = { id: 'u1', name: 'Arian', email: 'a@b.c' }

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(ME)
})

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

const patch = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

describe('PATCH /api/users/[id] — profile enums', () => {
  const params = Promise.resolve({ id: 'u1' })

  it('rejects a paceLevel outside the enum, and says what is allowed', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const res = await PATCH(patch('/api/users/u1', { paceLevel: 'fast' }), { params })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('beginner, intermediate, advanced')
  })

  it('rejects a bad schedulePreference', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const res = await PATCH(patch('/api/users/u1', { schedulePreference: 'midnight' }), { params })
    expect(res.status).toBe(400)
  })

  // schedulePreference stopped being one value when onboarding became
  // multi-select, and the validator didn't notice. Every one of these was a 400
  // in production: you could tick one box, and only one.
  describe('schedulePreference is a set, not a single value', () => {
    it.each([
      ['morning,evening', 'two slots — the reason multi-select exists'],
      ['morning,afternoon,evening', 'all three'],
      ['', 'none — the column default, and a real answer'],
      ['afternoon', 'still accepts a single slot'],
    ])('accepts %j (%s)', async (value) => {
      const { PATCH } = await import('@/app/api/users/[id]/route')
      const res = await PATCH(patch('/api/users/u1', { schedulePreference: value }), { params })
      expect(res.status).toBe(200)
    })

    it.each([
      ['morning,midnight', 'one bad member poisons the set'],
      ['morning,morning', 'a set that repeats itself is a bug upstream'],
      ['morning, evening', 'stray whitespace is not a slot'],
    ])('rejects %j (%s)', async (value) => {
      const { PATCH } = await import('@/app/api/users/[id]/route')
      const res = await PATCH(patch('/api/users/u1', { schedulePreference: value }), { params })
      expect(res.status).toBe(400)
    })
  })

  it('accepts a valid value', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const res = await PATCH(patch('/api/users/u1', { paceLevel: 'advanced' }), { params })
    expect(res.status).toBe(200)
  })

  it('lets an untouched field through — PATCH may send any subset', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const res = await PATCH(patch('/api/users/u1', { bio: 'hello' }), { params })
    expect(res.status).toBe(200)
  })

  it("won't let you edit someone else's profile", async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route')
    const res = await PATCH(patch('/api/users/u2', { bio: 'x' }), {
      params: Promise.resolve({ id: 'u2' }),
    })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/feed — postType', () => {
  it('rejects a postType outside the enum', async () => {
    const { POST } = await import('@/app/api/feed/route')
    const res = await POST(post('/api/feed', { content: 'hi', postType: 'rant' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('moment, milestone, question, challenge')
  })

  it('accepts a valid postType', async () => {
    const { POST } = await import('@/app/api/feed/route')
    expect((await POST(post('/api/feed', { content: 'hi', postType: 'milestone' }))).status).toBe(201)
  })

  it('rejects an image that is not a data URL', async () => {
    const { POST } = await import('@/app/api/feed/route')
    const res = await POST(post('/api/feed', { content: 'hi', imageUrl: 'javascript:alert(1)' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/runs — sportType', () => {
  it('rejects a sportType outside the enum', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post('/api/runs', { distanceKm: 5, sportType: 'swimming' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('running, trail, walking')
  })
})

describe('/api/seed', () => {
  // A GET that wipes the database is reachable by anything that follows a link —
  // a crawler, a prefetch, a pasted URL. It must not exist at all.
  it('exposes no GET handler', async () => {
    const mod = await import('@/app/api/seed/route')
    expect('GET' in mod).toBe(false)
    expect('POST' in mod).toBe(true)
  })
})
