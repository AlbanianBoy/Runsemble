import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Push reaches every device, not just the newest ───────────────────────────
// User.fcmToken was a single column, so the second device to register overwrote
// the first — and the first then received nothing, for ever. No error, no log
// line, no failed request. A phone plus a tablet, or one reinstall, was enough.
//
// The bug was invisible precisely because the happy path stayed green: the
// device you were testing on always worked, because it was the last to register.

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

const sendPush = vi.hoisted(() => vi.fn())
vi.mock('@/lib/fcm', () => ({ sendPush }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

const ME = { id: 'u1', name: 'Arian', email: 'a@b.c' }

const req = (body: unknown, method = 'POST') =>
  new NextRequest('http://localhost/api/push-token', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(ME)
  sendPush.mockReset()
  sendPush.mockResolvedValue({ ok: true, tokenDead: false })
  overrides = {}
})

describe('POST /api/push-token', () => {
  it('upserts on the token, so a second device is added rather than replacing the first', async () => {
    let args: { where?: unknown; create?: unknown } = {}
    overrides['userDevice.upsert'] = (a: unknown) => {
      args = a as typeof args
      return {}
    }

    const { POST } = await import('@/app/api/push-token/route')
    expect((await POST(req({ token: 'tok-device-2', platform: 'ios' }))).status).toBe(200)

    // Keyed on the token — the whole fix. Keying on the user is what clobbered.
    expect(args.where).toEqual({ token: 'tok-device-2' })
    expect(args.create).toMatchObject({ userId: 'u1', token: 'tok-device-2', platform: 'ios' })
  })

  it('is 401 for an anonymous caller — you cannot register a device onto someone else', async () => {
    getSessionUser.mockResolvedValue(null)
    const { POST } = await import('@/app/api/push-token/route')
    expect((await POST(req({ token: 'tok' }))).status).toBe(401)
  })

  it('accepts an empty token without storing anything — permission was refused', async () => {
    let called = false
    overrides['userDevice.upsert'] = () => ((called = true), {})

    const { POST } = await import('@/app/api/push-token/route')
    expect((await POST(req({ token: null }))).status).toBe(200)
    expect(called).toBe(false)
  })

  it('rejects a token that is obviously not one', async () => {
    const { POST } = await import('@/app/api/push-token/route')
    expect((await POST(req({ token: 'x' }))).status).toBe(400)
    expect((await POST(req({ token: 42 }))).status).toBe(400)
  })

  it('falls back to unknown rather than trusting an arbitrary platform string', async () => {
    let args: { create?: { platform?: string } } = {}
    overrides['userDevice.upsert'] = (a: unknown) => ((args = a as typeof args), {})

    const { POST } = await import('@/app/api/push-token/route')
    await POST(req({ token: 'tok-valid-1234', platform: 'nintendo-switch' }))
    expect(args.create?.platform).toBe('unknown')
  })
})

describe('notify() fan-out', () => {
  const spec = { userId: 'u1', type: 'group_message' as const, title: 'hi', actorId: 'u2' }

  it('pushes to every enabled device — the bug this whole table exists for', async () => {
    overrides['userDevice.findMany'] = () => [
      { token: 'phone' },
      { token: 'tablet' },
      { token: 'old-phone' },
    ]

    const { notify } = await import('@/lib/notify')
    await notify(spec)

    expect(sendPush).toHaveBeenCalledTimes(3)
    expect(sendPush.mock.calls.map((c) => c[0].token).sort()).toEqual(['old-phone', 'phone', 'tablet'])
  })

  // The test above can't catch a query that only *asks* for one device: the mock
  // returns what the override says regardless of the arguments, so `take: 1`
  // would sail straight through it. Asserting the query itself is what closes
  // that hole — and reintroducing `take: 1` now fails here, as it must.
  it('asks the database for ALL enabled devices, with no limit', async () => {
    let args: { where?: unknown; take?: number; orderBy?: unknown } = {}
    overrides['userDevice.findMany'] = (a: unknown) => {
      args = a as typeof args
      return [{ token: 'phone' }]
    }

    const { notify } = await import('@/lib/notify')
    await notify(spec)

    expect(args.where).toEqual({ userId: 'u1', enabled: true })
    expect(args.take).toBeUndefined() // a limit here silently drops someone's device
  })

  it('sends nothing when the user has no devices, and does not throw', async () => {
    overrides['userDevice.findMany'] = () => []

    const { notify } = await import('@/lib/notify')
    await notify(spec)

    expect(sendPush).not.toHaveBeenCalled()
  })

  it('retires a token FCM says is gone, and leaves the live ones alone', async () => {
    overrides['userDevice.findMany'] = () => [{ token: 'live' }, { token: 'uninstalled' }]
    sendPush.mockImplementation(async ({ token }: { token: string }) =>
      token === 'uninstalled' ? { ok: false, tokenDead: true } : { ok: true, tokenDead: false }
    )
    let disabled: unknown = null
    overrides['userDevice.updateMany'] = (a: unknown) => ((disabled = a), { count: 1 })

    const { notify } = await import('@/lib/notify')
    await notify(spec)

    // Only the dead one is retired. Without this the table fills with tokens from
    // uninstalled apps and every future notification pays to retry them.
    expect(disabled).toMatchObject({
      where: { token: { in: ['uninstalled'] } },
      data: { enabled: false },
    })
  })

  it('keeps a token that merely failed — a 500 from FCM is not the token\'s fault', async () => {
    overrides['userDevice.findMany'] = () => [{ token: 'phone' }]
    sendPush.mockResolvedValue({ ok: false, tokenDead: false })
    let disabled = false
    overrides['userDevice.updateMany'] = () => ((disabled = true), { count: 0 })

    const { notify } = await import('@/lib/notify')
    await notify(spec)

    expect(disabled).toBe(false)
  })

  it('still refuses to notify you about your own action', async () => {
    overrides['userDevice.findMany'] = () => [{ token: 'phone' }]

    const { notify } = await import('@/lib/notify')
    await notify({ ...spec, actorId: 'u1' }) // actor === recipient

    expect(sendPush).not.toHaveBeenCalled()
  })
})
