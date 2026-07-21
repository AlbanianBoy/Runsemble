import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'
import { SPORT_TYPES } from '@/lib/enums'

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

const notify = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))
vi.mock('@/lib/notify', () => ({ notify }))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ME = {
  id: 'u1', name: 'Arian', email: 'a@b.c',
  totalDistanceKm: 0, totalRuns: 0, streak: 0, longestStreak: 0,
  lastActiveDate: null, xp: 0,
}

// A valid 5 km / 30 min run (360 s/km — well inside pace bounds). Includes a
// couple of GPS points, because a tracked run
// always records some. Distance verification rejects a substantial claim carried
// with no route at all (the pure-cURL fabrication), so a fixture that means to be
// a valid run has to look like one.
const GOOD_RUN = {
  distanceKm: 5,
  durationSec: 1800,
  path: [{ lat: 51.2, lng: 4.4 }, { lat: 51.21, lng: 4.41 }],
}

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
    // Pull directly from the enum module so this test never drifts from the
    // real allowed set again — if SPORT_TYPES changes, the test auto-updates.
    for (const sportType of SPORT_TYPES) {
      const res = await POST(post({ ...GOOD_RUN, sportType }))
      expect(res.status).toBe(201)
    }
  })

  it('accepts the default (no sportType field) which falls back to "running"', async () => {
    const { POST } = await import('@/app/api/runs/route')
    expect((await POST(post(GOOD_RUN))).status).toBe(201)
  })
})

// ─── Distance verification ──────────────────────────────────────────────────
// The pace/total bounds trust the claimed distance; this is the wiring that
// makes the route reject a substantial distance with no GPS behind it at all.
// The threshold logic lives in run-math (verifyRunDistance) and is unit-tested
// there against real recorded runs; here we only prove the route enforces it.
describe('distance must have a route behind it', () => {
  it('rejects a big distance claimed with no GPS path — the pure-cURL attack', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ distanceKm: 15, durationSec: 5400 })) // 6:00/km, no path
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/no GPS/i)
  })

  it('accepts the same distance once a real route is attached', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, distanceKm: 15, durationSec: 5400 }))
    expect(res.status).toBe(201)
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
    const body = await (await POST(post({ ...GOOD_RUN }))).json()
    // 20 + 50 + 0 + 0 = 70
    expect(body.session.xpEarned).toBe(70)
  })

  it('adds 15 XP per untagged companion', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ ...GOOD_RUN, companions: 2 }))
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
    // ...and they both turned up to the same hotspot, which is what makes them
    // taggable at all. Without evidence of running together the tag is dropped.
    overrides['hotspotParticipant.findMany'] = () => [{ userId: 'u2' }]

    const { POST } = await import('@/app/api/runs/route')
    const body = await (
      await POST(post({ ...GOOD_RUN, hotspotId: 'h1', buddyIds: ['u2'] }))
    ).json()
    // 20 + 50 + 30 = 100
    expect(body.session.xpEarned).toBe(100)
    expect(body.newBuddyCount).toBe(1)
  })
})

// ─── Feed post creation ───────────────────────────────────────────────────────

describe('shareToFeed', () => {
  it('creates a feedPost when shareToFeed is true', async () => {
    // Use a plain captured-args pattern instead of vi.mocked() to avoid TS
    // inferring an empty-tuple call signature from the mock initialiser.
    let capturedCallArg: unknown = undefined
    const feedPostCreate = vi.fn(async (...args: unknown[]) => {
      capturedCallArg = args[0]
      return { id: 'fp1' }
    })
    overrides['feedPost.create'] = feedPostCreate

    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, shareToFeed: true }))

    expect(res.status).toBe(201)
    expect(feedPostCreate).toHaveBeenCalledOnce()
    const callArg = capturedCallArg as { data: { postType: string; authorId: string } }
    expect(callArg.data.postType).toBe('milestone')
    expect(callArg.data.authorId).toBe(ME.id)
  })

  it('does NOT create a feedPost when shareToFeed is false or omitted', async () => {
    const feedPostCreate = vi.fn(async (..._args: unknown[]) => ({ id: 'fp1' }))
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
    overrides['hotspotParticipant.findMany'] = () => [{ userId: 'u2' }]

    const { POST } = await import('@/app/api/runs/route')
    await POST(post({ ...GOOD_RUN, hotspotId: 'h1', buddyIds: ['u2'] }))

    const calls = notify.mock.calls as unknown[][]
    const buddyNotify = calls.find(
      (c) => (c[0] as { userId: string }).userId === 'u2'
    )
    expect(buddyNotify).toBeDefined()
    expect((buddyNotify![0] as { type: string }).type).toBe('run_invite')
  })

  it('drops a tag on someone there is no evidence you ran with', async () => {
    // The hole this closes: buddyIds accepted any id at all, so twenty
    // strangers could be collected per save — each one getting a row on their
    // profile and a push — with nothing tying them to the run.
    const OTHER = { id: 'u2', name: 'Bart' }
    overrides['user.findUnique'] = (args: unknown) =>
      (args as { where: { id: string } }).where.id === 'u2' ? OTHER : ME
    overrides['buddy.findUnique'] = () => null
    const buddyCreateMany = vi.fn(() => ({ count: 0 }))
    overrides['buddy.createMany'] = buddyCreateMany

    const { POST } = await import('@/app/api/runs/route')
    // No hotspot, no group, not already buddies, no accepted invite.
    const body = await (await POST(post({ ...GOOD_RUN, buddyIds: ['u2'] }))).json()

    expect(body.newBuddyCount).toBe(0)
    expect(body.rejectedBuddyCount).toBe(1)
    expect(buddyCreateMany).not.toHaveBeenCalled()
    // And crucially: the person was never told anything happened.
    const calls = notify.mock.calls as unknown[][]
    expect(calls.find((c) => (c[0] as { userId: string }).userId === 'u2')).toBeUndefined()
  })

  it('still saves the run when a tag is dropped', async () => {
    // The run already happened, possibly hours ago on a queued offline save.
    // Refusing to store it because of who was tagged would lose real data.
    overrides['buddy.findUnique'] = () => null
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ ...GOOD_RUN, buddyIds: ['stranger'] }))
    expect(res.status).toBe(201)
    expect((await res.json()).session.distanceKm).toBe(5)
  })
})
