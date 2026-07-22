import { describe, it, expect, beforeEach, vi } from 'vitest'

// decideDelivery is the gate between "a stranger can reach your lock screen"
// and "a stranger can knock". Every branch below is a real situation someone
// will be in, and getting one wrong either lets harassment through or silently
// swallows a message between two people who know each other.

const findUniqueBuddy = vi.hoisted(() => vi.fn())
const findUniqueRequest = vi.hoisted(() => vi.fn())
const findFirstMessage = vi.hoisted(() => vi.fn())
const upsertRequest = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    buddy: { findUnique: findUniqueBuddy },
    messageRequest: { findUnique: findUniqueRequest, upsert: upsertRequest },
    chatMessage: { findFirst: findFirstMessage },
  },
}))

const { decideDelivery, openMessageRequest } = await import('@/lib/message-access')

beforeEach(() => {
  vi.clearAllMocks()
  findUniqueBuddy.mockResolvedValue(null)
  findUniqueRequest.mockResolvedValue(null)
  findFirstMessage.mockResolvedValue(null)
  upsertRequest.mockResolvedValue({})
})

describe('decideDelivery', () => {
  it('makes a total stranger knock', async () => {
    expect(await decideDelivery('stranger', 'me')).toEqual({ kind: 'request' })
  })

  it('delivers from a buddy', async () => {
    // Buddies ran together — co-presence was already proven to create the row.
    findUniqueBuddy.mockResolvedValue({ id: 'b1' })
    expect(await decideDelivery('buddy', 'me')).toEqual({ kind: 'deliver' })
  })

  it('delivers once the request has been accepted', async () => {
    findUniqueRequest.mockResolvedValue({ status: 'accepted' })
    expect(await decideDelivery('them', 'me')).toEqual({ kind: 'deliver' })
  })

  it('delivers to someone the recipient has already written to', async () => {
    // Acceptance by conduct. Prompting someone to Accept a person they visibly
    // already replied to is asking about a decision they have made.
    findFirstMessage.mockResolvedValue({ id: 'm1' })
    expect(await decideDelivery('them', 'me')).toEqual({ kind: 'deliver' })
  })

  it('refuses after a decline', async () => {
    findUniqueRequest.mockResolvedValue({ status: 'declined' })
    const d = await decideDelivery('them', 'me')
    expect(d.kind).toBe('refuse')
  })

  it('gives a declined sender the same wording a block gives', async () => {
    // Telling someone they were specifically declined turns a quiet exit into a
    // confrontation, which is what stops people using it at all.
    findUniqueRequest.mockResolvedValue({ status: 'declined' })
    const declined = await decideDelivery('them', 'me')
    expect(declined.kind === 'refuse' && declined.reason).toBe('Cannot message this user')
  })

  it('checks the buddy row in the RECIPIENT’s direction', async () => {
    // Buddy rows are directional. Reading the sender's own row would let anyone
    // who tagged you decide they may message you.
    await decideDelivery('sender', 'recipient')
    expect(findUniqueBuddy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_buddyId: { userId: 'recipient', buddyId: 'sender' } },
      })
    )
  })

  it('looks for a reply FROM the recipient, not just any message between them', async () => {
    // The stranger's own messages must not count as evidence of consent.
    await decideDelivery('sender', 'recipient')
    expect(findFirstMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { senderId: 'recipient', recipientId: 'sender' },
      })
    )
  })

  it('is directional — a pending request one way says nothing about the other', async () => {
    findUniqueRequest.mockResolvedValue({ status: 'pending' })
    expect((await decideDelivery('a', 'b')).kind).toBe('request')
    expect(findUniqueRequest).toHaveBeenCalledWith(
      expect.objectContaining({ where: { senderId_recipientId: { senderId: 'a', recipientId: 'b' } } })
    )
  })
})

describe('openMessageRequest', () => {
  it('does not reset an existing request', async () => {
    // Re-sending must not move the request back to the top of the recipient's
    // list — that would make persistence a way of getting attention.
    await openMessageRequest('a', 'b')
    const args = upsertRequest.mock.calls[0]![0] as { update: object }
    expect(args.update).toEqual({})
  })
})
