import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Saving a run: anti-cheat and idempotency ─────────────────────────────────
// Two properties worth holding onto here.
//
// The leaderboard is the reward for showing up, so a run POST is the one place a
// client could simply claim 500 km and top it. The bounds are the only thing
// standing between the board and a fabricated number.
//
// And run uploads queue offline and retry, so the same run arrives twice as a
// matter of course — on a flaky connection, not as an attack. clientRunId is
// what makes the retry harmless.

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
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }))

const ME = {
  id: 'u1', name: 'Arian', email: 'a@b.c',
  totalDistanceKm: 0, totalRuns: 0, streak: 0, longestStreak: 0,
  lastActiveDate: null, xp: 0,
}

// A minimal real route. The route rejects a substantial distance claimed with no
// GPS points at all (the pure-cURL fabrication), so a fixture meant to be a valid
// run carries a couple of points, as any tracked run does.
const RUN_PATH = [{ lat: 51.2, lng: 4.4 }, { lat: 51.21, lng: 4.41 }]

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/runs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(ME)
  overrides = {
    'user.findUnique': () => ME,
    'runSession.findUnique': () => null,
    'runSession.create': (args: unknown) => ({ id: 's1', ...(args as { data: object }).data }),
    'runSession.count': () => 1,
    'user.update': () => ({ ...ME, xp: 50 }),
  }
})

describe('plausibility bounds', () => {
  // 100 km in 10 minutes is a car, not a run.
  it('rejects a pace faster than any human, so the leaderboard cannot be gamed', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ distanceKm: 100, durationSec: 600 }))

    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('pace out of realistic range')
  })

  it('rejects a pace slower than a walk', async () => {
    const { POST } = await import('@/app/api/runs/route')
    // 1 km in 2 hours — 7200 s/km, far past the 1800 s/km bound.
    expect((await POST(post({ distanceKm: 1, durationSec: 7200 }))).status).toBe(422)
  })

  it('accepts an ordinary run', async () => {
    const { POST } = await import('@/app/api/runs/route')
    // 5 km in 30 min — 360 s/km.
    expect((await POST(post({ distanceKm: 5, durationSec: 1800, path: RUN_PATH }))).status).toBe(201)
  })

  it('accepts an elite pace at the boundary rather than punishing being fast', async () => {
    const { POST } = await import('@/app/api/runs/route')
    // 10 km in 20 min — 120 s/km, exactly the limit.
    expect((await POST(post({ distanceKm: 10, durationSec: 1200, path: RUN_PATH }))).status).toBe(201)
  })

  it('allows a run with no distance yet — the bounds only apply once both are set', async () => {
    const { POST } = await import('@/app/api/runs/route')
    expect((await POST(post({ distanceKm: 0, durationSec: 0 }))).status).toBe(201)
  })
})

describe('clientRunId idempotency', () => {
  // The offline queue retries; the same run must not count twice.
  it('returns the existing run instead of creating a second one', async () => {
    const existing = { id: 's1', userId: 'u1', distanceKm: 5 }
    overrides['runSession.findUnique'] = () => existing

    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(post({ clientRunId: 'abc', distanceKm: 5, durationSec: 1800 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.duplicate).toBe(true)
    expect(body.session).toEqual(existing)
  })

  // clientRunId is generated on the device, so it only means anything inside one
  // account. It used to be globally unique, which turned a coincidental collision
  // between two users into a refused run for the second one. The lookup is now
  // keyed on (userId, clientRunId), so another account's identical id is simply
  // invisible here and the run saves normally.
  it('scopes the idempotency lookup to the current user', async () => {
    let seenWhere: unknown = null
    overrides['runSession.findUnique'] = (...args: unknown[]) => {
      seenWhere = (args[0] as { where?: unknown })?.where
      return null // no run of *mine* carries that id
    }

    const { POST } = await import('@/app/api/runs/route')
    const res = await POST(
      post({ clientRunId: 'abc', distanceKm: 5, durationSec: 1800, path: RUN_PATH })
    )

    expect(seenWhere).toEqual({ userId_clientRunId: { userId: 'u1', clientRunId: 'abc' } })
    expect(res.status).toBe(201)
  })
})

describe('the run response', () => {
  // run-tracker toasts these immediately, so they have to come back with the
  // save rather than being computed after it.
  it('carries the XP and badges the client toasts', async () => {
    const { POST } = await import('@/app/api/runs/route')
    const body = await (await POST(post({ distanceKm: 5, durationSec: 1800, path: RUN_PATH }))).json()

    expect(body).toHaveProperty('session')
    expect(body).toHaveProperty('xp')
    expect(body).toHaveProperty('badgesEarned')
    expect(body).toHaveProperty('streak')
    expect(Array.isArray(body.badgesEarned)).toBe(true)
  })
})
