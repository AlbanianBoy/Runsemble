import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── The like toggle, and the race that reached production ────────────────────
// The original version read the row, then acted on what it saw. A double tap
// fits between those two steps: both requests find the same like, both try to
// remove it, and the loser throws P2025 on a row that is already gone. It showed
// up as a 500 in the Vercel logs, from a button that is trivially double-tapped
// on a phone.
//
// The fix lets the write decide: deleteMany reports how many rows it removed and
// is content with none, and a create that loses to a concurrent one is caught as
// P2002. Same end state either way — which is what "idempotent" has to mean here.

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
vi.mock('@/lib/feed-access', () => ({ canViewPost: vi.fn(async () => true) }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => {}) }))

const POST_ROW = { id: 'p1', authorId: 'author', groupId: null, content: 'hi' }
const req = () => new NextRequest('http://localhost/api/feed/p1/like', { method: 'POST' })
const params = { params: Promise.resolve({ id: 'p1' }) }

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue({ id: 'u1', name: 'Arian' })
  overrides = { 'feedPost.findUnique': () => POST_ROW }
})

describe('POST /api/feed/[id]/like', () => {
  it('likes a post that was not liked, and reports the new count', async () => {
    overrides['postLike.deleteMany'] = () => ({ count: 0 }) // nothing to remove → this is a like
    overrides['postLike.count'] = () => 1

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    const body = await (await POST(req(), params)).json()

    expect(body).toEqual({ liked: true, likes: 1 })
  })

  it('unlikes a post that was liked', async () => {
    overrides['postLike.deleteMany'] = () => ({ count: 1 }) // removed one → this is an unlike
    overrides['postLike.count'] = () => 0

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    const body = await (await POST(req(), params)).json()

    expect(body).toEqual({ liked: false, likes: 0 })
  })

  it('survives losing the create race — a concurrent like is the same end state', async () => {
    overrides['postLike.deleteMany'] = () => ({ count: 0 })
    overrides['postLike.create'] = () => {
      // What Postgres raises when the other request inserted first.
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.2',
      })
    }
    overrides['postLike.count'] = () => 1

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    const res = await POST(req(), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ liked: true, likes: 1 })
  })

  it('still surfaces a genuine database failure rather than swallowing it', async () => {
    overrides['postLike.deleteMany'] = () => ({ count: 0 })
    overrides['postLike.create'] = () => {
      throw new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '6.19.2',
      })
    }

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    expect((await POST(req(), params)).status).toBe(500)
  })

  it('is 404 for a post that does not exist', async () => {
    overrides['feedPost.findUnique'] = () => null

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    expect((await POST(req(), params)).status).toBe(404)
  })

  it('is 401 for an anonymous caller', async () => {
    getSessionUser.mockResolvedValue(null)

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    expect((await POST(req(), params)).status).toBe(401)
  })
})

describe('private group posts', () => {
  it('cannot be liked by someone who cannot see them', async () => {
    const { canViewPost } = await import('@/lib/feed-access')
    vi.mocked(canViewPost).mockResolvedValueOnce(false)

    const { POST } = await import('@/app/api/feed/[id]/like/route')
    expect((await POST(req(), params)).status).toBe(403)
  })
})
