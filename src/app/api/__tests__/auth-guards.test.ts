import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb } from './helpers/mock-db'

// ─── Every private route refuses an anonymous caller ──────────────────────────
// The audit found GET /api/users returning the whole user list to anyone who
// asked. It's guarded now, but "someone added a route and forgot the guard" is a
// mistake with no symptom in development — you're always logged in there. These
// tests are the thing that notices.

const { db } = makeDb()
vi.mock('@/lib/db', () => ({ db }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(null) // anonymous unless a test says otherwise
})

const req = (url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })

describe('routes that require a session', () => {
  it('GET /api/users is 401 for an anonymous caller', async () => {
    const { GET } = await import('@/app/api/users/route')
    expect((await GET()).status).toBe(401)
  })

  it('GET /api/auth/export is 401 for an anonymous caller', async () => {
    const { GET } = await import('@/app/api/auth/export/route')
    expect((await GET()).status).toBe(401)
  })

  it('GET /api/messages is 401 for an anonymous caller', async () => {
    const { GET } = await import('@/app/api/messages/route')
    expect((await GET(req('/api/messages'))).status).toBe(401)
  })

  it('POST /api/messages is 401 for an anonymous caller', async () => {
    const { POST } = await import('@/app/api/messages/route')
    expect((await POST(req('/api/messages', { recipientId: 'u2', content: 'hi' }))).status).toBe(401)
  })

  it('POST /api/feed is 401 for an anonymous caller', async () => {
    const { POST } = await import('@/app/api/feed/route')
    expect((await POST(req('/api/feed', { content: 'hello' }))).status).toBe(401)
  })

  it('POST /api/runs is 401 for an anonymous caller', async () => {
    const { POST } = await import('@/app/api/runs/route')
    expect((await POST(req('/api/runs', { distanceKm: 1 }))).status).toBe(401)
  })

  it('GET /api/runs is 401 — a GPS trace is private to its owner', async () => {
    const { GET } = await import('@/app/api/runs/route')
    expect((await GET()).status).toBe(401)
  })
})

describe('the anonymous feed', () => {
  // Deliberately readable while logged out; it must simply not personalise.
  it('GET /api/feed serves an anonymous reader without erroring', async () => {
    const { GET } = await import('@/app/api/feed/route')
    expect((await GET(req('/api/feed'))).status).toBe(200)
  })
})
