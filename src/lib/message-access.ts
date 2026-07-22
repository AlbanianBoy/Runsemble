// ─── Who may land in your inbox, and who has to knock first ──────────────────
//
// Anyone could DM anyone, and every message fired a push. On an app whose whole
// premise is meeting people you have not met yet, that makes both the inbox and
// the lock screen reachable by any account that can find you on the map. Block
// works — but only after the message has arrived and buzzed, which is after the
// harm the block exists to prevent.
//
// A first message from someone you have no connection to is now a request:
// stored, visible when you go looking for it, and SILENT. That last part is the
// one that matters. A request that pushes is just a message with extra steps.
//
// What counts as a connection, in the order it is cheapest to check:
//   • you are buddies                — you ran together; co-presence was proven
//   • you already accepted them      — an explicit yes
//   • you have ever messaged THEM    — acceptance by conduct, no tap required
//   • you declined them              — refused, and they are not told
//
// Directional on purpose. A requesting B says nothing about B requesting A.

import { db } from './db'

export type DeliveryDecision =
  /** Straight to the inbox, push and all. */
  | { kind: 'deliver' }
  /** Stored, listed under requests, no push. */
  | { kind: 'request' }
  /** Refused outright — they declined, or a block is in place. */
  | { kind: 'refuse'; reason: string }

/**
 * Decide what happens to a message from `senderId` to `recipientId`.
 *
 * Blocks are checked by the caller before this runs; this is about consent to
 * be contacted at all, which is a softer and earlier question.
 */
export async function decideDelivery(
  senderId: string,
  recipientId: string
): Promise<DeliveryDecision> {
  // Cheapest first, and each of these alone is enough to deliver.
  const [buddy, request, everRepliedTo] = await Promise.all([
    db.buddy.findUnique({
      where: { userId_buddyId: { userId: recipientId, buddyId: senderId } },
      select: { id: true },
    }),
    db.messageRequest.findUnique({
      where: { senderId_recipientId: { senderId, recipientId } },
      select: { status: true },
    }),
    // The recipient having written to the sender at any point is a yes. Making
    // someone tap Accept for a person they already replied to would be a prompt
    // about a decision they have visibly already made.
    db.chatMessage.findFirst({
      where: { senderId: recipientId, recipientId: senderId },
      select: { id: true },
    }),
  ])

  if (buddy || everRepliedTo) return { kind: 'deliver' }

  if (request?.status === 'accepted') return { kind: 'deliver' }
  if (request?.status === 'declined') {
    // Deliberately the same wording a block produces. Telling a sender they
    // were specifically declined turns a quiet exit into a confrontation, which
    // is exactly what stops people using it.
    return { kind: 'refuse', reason: 'Cannot message this user' }
  }

  return { kind: 'request' }
}

/**
 * Record that a request is outstanding. Idempotent: a sender who writes three
 * times before being answered has made one request, not three.
 */
export async function openMessageRequest(senderId: string, recipientId: string): Promise<void> {
  await db.messageRequest.upsert({
    where: { senderId_recipientId: { senderId, recipientId } },
    create: { senderId, recipientId },
    // Nothing to change: re-sending must not reset createdAt and push the
    // request back to the top of the recipient's list, which would turn
    // persistence into a way of getting attention.
    update: {},
  })
}
