import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Server-side run verification ─────────────────────────────────────────────
// runs.test.ts owns pace-bounds and clientRunId idempotency.
// This file owns everything else the POST route is responsible for validating
// or enforcing before it writes to the database.

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

const notify = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/notify', () => ({ notify }))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME = {
  id: 'u1', name: 'Arian', email: 'a@b.c',
  totalDistanceKm: 0, totalRuns: 0, streak: 0, longestStreak: 0,
  lastActiveDate: null, xp: 0,
}

// A valid 5 km / 30 min run (360 s/km — well inside bounds).
const GOOD_RUN = { distanceKm: 5, durationSec: 1800 }

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/runs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  getSessionUser.mockReset()
  notify.mockReset()
  getSessionUser.mockResolvedValue(ME)
  overrides = {
    'user.findUnique':      () => ME,
    'runSession.findUnique': () => null,
    'runSession.create':    (args: unknown) => ({ id: 's1', ...(args as { data: object }).data }),
    'runSession.count':     () => 1,
    'user.update':          () => ({ ...ME, xp: 50 }),
    'buddy.findUnique':     () => null,   // no existing buddy by default
    'buddy.createMany':     () => ({ count: 2 }),
    'feedPost.create':      () => ({ id: 'fp1' }),
  }
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe('auth guard', () => {
  it('returns 401 when no session exists', async () => {
    getSessionUser.mockResolvedValue(null)
    const { POST } = await import('@/app/api/runs/route')
    expect((await POST(post(GOOD_RUN))).status).toBe(401)
  })
})

// ─── sportType enum validation ────────────────────────────────────────────────

describe('sportType enum validation', () => {
  it('rejects an unknown sport so the DB never stores garbage', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, sportType: 'teleportation' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/sportType/i)
  })

  it('accepts every allowed sport value', async () => {
    const { POST } = await import('@/app/api/runs/route')
    // These are the SPORT_TYPES the enum module defines.
    const validSports = ['running', 'cycling', 'walking', 'hiking', 'swimming']
    for (const sportType of validSports) {
      const res = await POST(post({ ...GOOD_RUN, sportType }))
      expect(res.status).toBe(201)
    }
  })

  it('accepts the default (no sportType field) which falls back to "running"', async () => {
    const { POST } = await import('@/app/api/runs/route')
    expect((await POST(post(GOOD_RUN))).status).toBe(201)
  })
})

// ─── Path / splits byte-cap ───────────────────────────────────────────────────

describe('path and splits size capping', () => {
  it('stores a path that arrives oversized as a truncated string, not null', async () => {
    // 100 001 characters — just over the 100 000 char cap in the route.
    const hugePath = Array.from({ length: 10_000 }, (_, i) => ({
      lat: 51.2 + i * 0.0001,
      lng: 4.4 + i * 0.0001,
    }))

    let capturedData: Record<string, unknown> | null = null
    overrides['runSession.create'] = (args: unknown) => {
      capturedData = (args as { data: Record<string, unknown> }).data
      return { id: 's1', ...capturedData }
    }

    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, path: hugePath }))

    expect(res.status).toBe(201)
    // The route slices to 100 000 chars max.
    expect(typeof capturedData!.path).toBe('string')
    expect((capturedData!.path as string).length).toBeLessThanOrEqual(100_000)
  })

  it('stores null for an empty splits array', async () => {
    let capturedData: Record<string, unknown> | null = null
    overrides['runSession.create'] = (args: unknown) => {
      capturedData = (args as { data: Record<string, unknown> }).data
      return { id: 's1', ...capturedData }
    }

    const { POST } = await import('@/app/api/runs/route')
    await POST(post({ ...GOOD_RUN, splits: [] }))

    expect(capturedData!.splits).toBeNull()
  })
})

// ─── XP arithmetic ────────────────────────────────────────────────────────────

describe('XP arithmetic', () => {
  // Formula from the route:
  //   xpEarned = 20 (base) + round(dist * 10) + newBuddyCount * 30 + untaggedCompanions * 15
  it('computes the correct XP for a solo 5 km run', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const body = await (await POST(post({ distanceKm: 5, durationSec: 1800 }))).json()
    // 20 + 50 + 0 + 0 = 70
    expect(body.session.xpEarned).toBe(70)
  })

  it('adds 15 XP per untagged companion', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ distanceKm: 5, durationSec: 1800, companions: 2 }))
    ).json()
    // 20 + 50 + 0 + 30 = 100
    expect(body.session.xpEarned).toBe(100)
  })

  it('adds 30 XP per new buddy (tagged run partner)', async () => {
    const OTHER = { id: 'u2', name: 'Bart' }
    overrides['user.findUnique'] = (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id
      return id === 'u2' ? OTHER : ME
    }
    // buddy does not exist yet → will be created
    overrides['buddy.findUnique'] = () => null

    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ distanceKm: 5, durationSec: 1800, buddyIds: ['u2'] }))
    ).json()
    // 20 + 50 + 30 = 100
    expect(body.session.xpEarned).toBe(100)
    expect(body.newBuddyCount).toBe(1)
  })
})

// ─── Feed post creation ───────────────────────────────────────────────────────

describe('shareToFeed', () => {
  it('creates a feedPost when shareToFeed is true', async () => {
    const feedPostCreate = vi.fn(async () => ({ id: 'fp1' }))
    overrides['feedPost.create'] = feedPostCreate

    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, shareToFeed: true }))

    expect(res.status).toBe(201)
    expect(feedPostCreate).toHaveBeenCalledOnce()
    const callArg = feedPostCreate.mock.calls[0][0] as { data: { postType: string; authorId: string } }
    expect(callArg.data.postType).toBe('milestone')
    expect(callArg.data.authorId).toBe(ME.id)
  })

  it('does NOT create a feedPost when shareToFeed is false or omitted', async () => {
    const feedPostCreate = vi.fn(async () => ({ id: 'fp1' }))
    overrides['feedPost.create'] = feedPostCreate

    const { POST } = await import('@/app/api/runs/route')
    await POST(post(GOOD_RUN))

    expect(feedPostCreate).not.toHaveBeenCalled()
  })
})

// ─── Buddy tagging edge cases ─────────────────────────────────────────────────

describe('buddy tagging', () => {
  it('silently skips a buddyId that matches the current user (no self-buddy)', async () => {
    const buddyCreateMany = vi.fn(async () => ({ count: 0 }))
    overrides['buddy.createMany'] = buddyCreateMany

    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ ...GOOD_RUN, buddyIds: [ME.id] }))
    ).json()

    expect(buddyCreateMany).not.toHaveBeenCalled()
    expect(body.newBuddyCount).toBe(0)
  })

  it('skips a buddyId that does not resolve to a real user', async () => {
    overrides['user.findUnique'] = (args: unknown) => {
      const id = (args as { where: { id: string } }).where.id
      return id === ME.id ? ME : null
    }
    const buddyCreateMany = vi.fn(async () => ({ count: 0 }))
    overrides['buddy.createMany'] = buddyCreateMany

    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ ...GOOD_RUN, buddyIds: ['ghost-id'] }))
    ).json()

    expect(buddyCreateMany).not.toHaveBeenCalled()
    expect(body.newBuddyCount).toBe(0)
  })

  it('does not re-create a buddy relationship that already exists', async () => {
    const OTHER = { id: 'u2', name: 'Bart' }
    overrides['user.findUnique'] = (args: unknown) =>
      (args as { where: { id: string } }).where.id === 'u2' ? OTHER : ME
    // Already buddies
    overrides['buddy.findUnique'] = () => ({ userId: ME.id, buddyId: 'u2' })
    const buddyCreateMany = vi.fn(async () => ({ count: 0 }))
    overrides['buddy.createMany'] = buddyCreateMany

    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ ...GOOD_RUN, buddyIds: ['u2'] }))
    ).json()

    expect(buddyCreateMany).not.toHaveBeenCalled()
    expect(body.newBuddyCount).toBe(0)
  })

  it('sends a notification to a newly tagged buddy', async () => {
    const OTHER = { id: 'u2', name: 'Bart' }
    overrides['user.findUnique'] = (args: unknown) =>
      (args as { where: { id: string } }).where.id === 'u2' ? OTHER : ME
    overrides['buddy.findUnique'] = () => null

    const { POST } = await import('@/app/api/runs/route')
    await POST(post({ ...GOOD_RUN, buddyIds: ['u2'] }))

    const buddyNotify = notify.mock.calls.find(
      (c) => (c[0] as { userId: string }).userId === 'u2'
    )
    expect(buddyNotify).toBeDefined()
    expect((buddyNotify![0] as { type: string }).type).toBe('run_invite')
  })
})
