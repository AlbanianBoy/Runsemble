// ─── Notification outbox enqueue (server-only) ────────────────────────────────
// Call enqueueNotification() INSIDE a Prisma transaction alongside whatever
// write triggered the notification. The run (or message, or invite, …) and the
// promise-to-notify are then one atomic fact: if the transaction rolls back, no
// ghost notification is queued; if the function crashes after commit, the drain
// cron picks the row up and delivers it.
//
// The drain cron lives at src/app/api/cron/drain-outbox/route.ts and is
// scheduled every 5 minutes in vercel.json.
//
// Why not call notify() directly?
// notify() does two things: writes a Notification row AND fires FCM. If the
// serverless function is killed between the transaction commit and the notify()
// call, the run is saved but the tagged people are never told — permanently,
// because nothing retries a fan-out that never started. Enqueueing inside the
// transaction removes that window.

import type { PrismaClient } from '@prisma/client'
import type { ITXClientDenyList } from '@prisma/client/runtime/library'
import type { NotifySpec } from './notify'

// The Prisma transaction client type — the argument passed to the callback
// inside prisma.$transaction(async (tx) => { … }).
export type TxClient = Omit<PrismaClient, ITXClientDenyList>

/**
 * Enqueue a notification inside an open Prisma transaction.
 *
 * @example
 * await db.$transaction(async (tx) => {
 *   const run = await tx.runSession.create({ … })
 *   await enqueueNotification(tx, { userId: buddyId, type: 'run_complete', … })
 * })
 */
export async function enqueueNotification(
  tx: TxClient,
  spec: NotifySpec,
): Promise<void> {
  // Self-notifications are noise. Guard here too so the outbox never accumulates
  // rows that the drain would discard anyway.
  if (spec.actorId && spec.actorId === spec.userId) return

  await tx.notificationOutbox.create({
    data: {
      // Store the full spec as JSON text. Text rather than Prisma's Json type so
      // the column is readable without a cast and survives any Neon/Prisma Json
      // quirks. The drain deserialises with JSON.parse().
      payload: JSON.stringify(spec),
    },
  })
}
