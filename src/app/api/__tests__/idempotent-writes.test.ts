import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeDb, type DbOverrides } from './helpers/mock-db'

// ─── A retry must not become a second message ────────────────────────────────
// The failure this prevents: a phone on a train sends a DM, the row is written,
// the response is lost, the app shows a failure, the person taps send again —
// and the recipient gets it twice. /api/runs has been immune since offline sync
// landed; these are the paths that were not.

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

const ME = { id: 'u1', name: 'Arian', email: 'a@b.c' }
const THEM = { id: 'u2', name: 'Bart' }

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  getSessionUser.mockResolvedValue(ME)
  overrides = {
    'user.findUnique': () => THEM,
    'block.findFirst': () => null,
    'chatMessage.findUnique': () => null,
    'chatMessage.create': (args: unknown) => ({
      id: 'm1',
      ...(args as { data: object }).data,
    }),
  }
})

describe('POST /api/messages idempotency', () => {
  it('writes the message when the clientId has not been seen', async () => {
    const create = vi.fn((args: unknown) => ({ id: 'm1', ...(args as { data: object }).data }))
    overrides['chatMessage.create'] = create

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(
      post('/api/messages', { recipientId: 'u2', content: 'on my way', clientId: 'draft-1' })
    )

    expect(res.status).toBe(201) // Created
    expect(create).toHaveBeenCalledTimes(1)
    // The id is stored, or the retry below would have nothing to match against.
    expect((create.mock.calls[0]![0] as { data: { clientId: string } }).data.clientId).toBe('draft-1')
  })

  it('returns the original message on a retry, and does not write again', async () => {
    const original = { id: 'm1', senderId: 'u1', recipientId: 'u2', content: 'on my way' }
    overrides['chatMessage.findUnique'] = () => original
    const create = vi.fn(() => ({ id: 'm2' }))
    overrides['chatMessage.create'] = create

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(
      post('/api/messages', { recipientId: 'u2', content: 'on my way', clientId: 'draft-1' })
    )
    const body = await res.json()

    expect(create).not.toHaveBeenCalled()
    expect(body.duplicate).toBe(true)
    // Success, not an error: from the sender's side this attempt did work — the
    // first time. Surfacing a failure here would prompt a third attempt.
    // 200 rather than the 201 a fresh send returns, so a client that cares can
    // tell "stored" from "already stored".
    expect(res.status).toBe(200)
    expect(body.message.id).toBe('m1')
  })

  it('looks the id up scoped to the sender, never globally', async () => {
    // A device-generated id is only meaningful within one account. A global
    // lookup would let one person's collision swallow another person's message.
    const findUnique = vi.fn(() => null)
    overrides['chatMessage.findUnique'] = findUnique

    const { POST } = await import('@/app/api/messages/route')
    await POST(post('/api/messages', { recipientId: 'u2', content: 'hi', clientId: 'draft-1' }))

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { senderId_clientId: { senderId: 'u1', clientId: 'draft-1' } } })
    )
  })

  it('still sends when the client supplies no id at all', async () => {
    // An older app build sends nothing. It must keep working — a possible
    // duplicate is a far milder failure than refusing to send.
    const findUnique = vi.fn(() => null)
    const create = vi.fn((args: unknown) => ({ id: 'm1', ...(args as { data: object }).data }))
    overrides['chatMessage.findUnique'] = findUnique
    overrides['chatMessage.create'] = create

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(post('/api/messages', { recipientId: 'u2', content: 'hi' }))

    expect(res.status).toBe(201)
    expect(findUnique).not.toHaveBeenCalled() // nothing to look up
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0]![0] as { data: { clientId: string | null } }).data.clientId).toBeNull()
  })

  it('treats two different compositions as two messages', async () => {
    // The id identifies what was written, not the attempt — so a second, genuinely
    // different message must not be swallowed as a duplicate of the first.
    const seen: Record<string, object> = { 'draft-1': { id: 'm1', content: 'first' } }
    overrides['chatMessage.findUnique'] = (args: unknown) => {
      const { clientId } = (args as { where: { senderId_clientId: { clientId: string } } }).where
        .senderId_clientId
      return seen[clientId] ?? null
    }
    const create = vi.fn((args: unknown) => ({ id: 'm2', ...(args as { data: object }).data }))
    overrides['chatMessage.create'] = create

    const { POST } = await import('@/app/api/messages/route')
    const res = await POST(
      post('/api/messages', { recipientId: 'u2', content: 'second', clientId: 'draft-2' })
    )

    expect(create).toHaveBeenCalledTimes(1)
    expect((await res.json()).duplicate).toBeUndefined()
  })
})
