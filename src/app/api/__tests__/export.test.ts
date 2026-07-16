import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeDb } from './helpers/mock-db'

// ─── GDPR export: the regression this whole file exists for ───────────────────
// This route returned 500 on every request in production. The DB3 consolidation
// deleted the GroupChatMessage model but left db.groupChatMessage.findMany() in
// place, so the property was undefined and the call threw. It shipped because
// next.config.ts had typescript.ignoreBuildErrors on — a green build proved
// nothing — and because nothing ever called the route outside a browser.
//
// Typechecking now catches that exact class. This catches the wider one: the
// route runs end to end, against a client whose models come from Prisma's real
// generated list. Reach for a model the schema doesn't have and this fails the
// same way production did.

const { db } = makeDb({
  'runSession.findMany': () => [{ id: 'r1', distanceKm: 5 }],
  'chatMessage.findMany': () => [{ id: 'm1', content: 'hi' }],
})
vi.mock('@/lib/db', () => ({ db }))

const getSessionUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  getSessionUser,
}))

const USER = { id: 'u1', name: 'Arian', email: 'a@b.c', passwordHash: 'scrypt:secret' }

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(USER)
})

describe('GET /api/auth/export', () => {
  it('returns 200 — it used to throw on a model a migration had deleted', async () => {
    const { GET } = await import('@/app/api/auth/export/route')
    expect((await GET()).status).toBe(200)
  })

  it('hands back every category it promises', async () => {
    const { GET } = await import('@/app/api/auth/export/route')
    const body = await (await GET()).json()

    // Data portability means all of it, so an absent key is a real defect.
    for (const key of [
      'exportedAt', 'profile', 'runs', 'posts', 'comments', 'likes', 'badges',
      'buddies', 'notifications', 'messages', 'participations', 'memberships',
      'ratings', 'challenges', 'groupChats', 'invites',
    ]) {
      expect(body, `missing "${key}"`).toHaveProperty(key)
    }
    expect(body.runs).toEqual([{ id: 'r1', distanceKm: 5 }])
  })

  it('never exports the password hash', async () => {
    const { GET } = await import('@/app/api/auth/export/route')
    const body = await (await GET()).json()

    expect(body.profile.passwordHash).toBeUndefined()
    expect(body.profile.id).toBe('u1')
    expect(JSON.stringify(body)).not.toContain('scrypt:secret')
  })

  it('downloads as a file rather than rendering', async () => {
    const { GET } = await import('@/app/api/auth/export/route')
    const res = await GET()

    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('content-disposition')).toContain('attachment')
  })
})
