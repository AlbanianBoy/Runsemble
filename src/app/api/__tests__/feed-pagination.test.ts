import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── Paging the feed ──────────────────────────────────────────────────────────
// Keyset pagination, not offset: with `skip`, a post published while you read
// shifts everything down a slot and page 2 hands back a row you already saw. A
// cursor is anchored to a row, so new posts arriving above it change nothing.
//
// The route asks for limit + 1 rows and treats the extra as "there's more". These
// tests pin that arithmetic, because an off-by-one here either loses the last
// page or serves an empty one forever.

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

const row = (id: string) => ({
  id,
  authorId: 'u1',
  groupId: null,
  content: `post ${id}`,
  createdAt: new Date(),
  _count: { likedBy: 0, commentThread: 0 },
  likedBy: [],
})

let lastArgs: { take?: number; cursor?: { id: string }; skip?: number; orderBy?: unknown } = {}

const get = (qs = '') => new NextRequest(`http://localhost/api/feed${qs}`)

beforeEach(() => {
  getSessionUser.mockReset()
  getSessionUser.mockResolvedValue(null)
  lastArgs = {}
  overrides = {
    'feedPost.findMany': (args: unknown) => {
      lastArgs = args as typeof lastArgs
      return []
    },
  }
})

describe('GET /api/feed paging', () => {
  it('defaults to 100 so an existing caller sees no change', async () => {
    const { GET } = await import('@/app/api/feed/route')
    await GET(get())

    expect(lastArgs.take).toBe(101) // limit + 1
    expect(lastArgs.cursor).toBeUndefined()
  })

  it('reports another page when the extra row comes back', async () => {
    overrides['feedPost.findMany'] = () => [row('a'), row('b'), row('c')] // asked 2, got 3

    const { GET } = await import('@/app/api/feed/route')
    const body = await (await GET(get('?limit=2'))).json()

    expect(body.posts).toHaveLength(2) // the extra is a probe, not content
    expect(body.posts.map((p: { id: string }) => p.id)).toEqual(['a', 'b'])
    expect(body.nextCursor).toBe('b') // resume after the last one delivered
  })

  it('reports the end when the extra row does not come back', async () => {
    overrides['feedPost.findMany'] = () => [row('a'), row('b')] // asked 2, got 2

    const { GET } = await import('@/app/api/feed/route')
    const body = await (await GET(get('?limit=2'))).json()

    expect(body.posts).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })

  it('handles an exactly-full last page — the boundary an off-by-one eats', async () => {
    overrides['feedPost.findMany'] = () => [row('a')] // asked 1, got 1

    const { GET } = await import('@/app/api/feed/route')
    const body = await (await GET(get('?limit=1'))).json()

    expect(body.posts.map((p: { id: string }) => p.id)).toEqual(['a'])
    expect(body.nextCursor).toBeNull()
  })

  it('resumes after the cursor rather than repeating it', async () => {
    const { GET } = await import('@/app/api/feed/route')
    await GET(get('?cursor=abc&limit=5'))

    expect(lastArgs.cursor).toEqual({ id: 'abc' })
    expect(lastArgs.skip).toBe(1) // the cursor row itself was already delivered
  })

  it('breaks createdAt ties by id so a page boundary is deterministic', async () => {
    const { GET } = await import('@/app/api/feed/route')
    await GET(get())

    expect(lastArgs.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  it('caps limit so a caller cannot ask for the whole table', async () => {
    const { GET } = await import('@/app/api/feed/route')
    await GET(get('?limit=100000'))

    expect(lastArgs.take).toBe(101)
  })

  it('ignores a nonsense limit instead of asking for take: NaN', async () => {
    const { GET } = await import('@/app/api/feed/route')

    await GET(get('?limit=abc'))
    expect(lastArgs.take).toBe(101)

    await GET(get('?limit=-5'))
    expect(lastArgs.take).toBe(2) // clamped to the 1 floor
  })

  it('still returns an empty feed cleanly', async () => {
    const { GET } = await import('@/app/api/feed/route')
    const body = await (await GET(get())).json()

    expect(body.posts).toEqual([])
    expect(body.nextCursor).toBeNull()
  })
})
