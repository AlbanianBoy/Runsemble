// ─── Notifications (server-only) ──────────────────────────────────────────────
// A tiny helper so any route can drop a notification into a user's inbox AND
// fire an FCM push to their device. All calls are best-effort — a notification
// failure must never break the action that triggered it.

import { db } from './db'
import { sendPush } from './fcm'

export type NotificationType =
  | 'hotspot_join'
  | 'hotspot_reminder'
  | 'run_invite'
  | 'group_message'
  | 'badge'
  | 'rank_up'
  | 'comment'
  | 'like'
  | 'run_complete'

export interface NotifySpec {
  userId: string
  actorId?: string | null
  /**
   * Display name of the actor. Only needed for a DM push: tapping it opens the
   * conversation sheet, which needs a name to render before any fetch resolves.
   */
  actorName?: string | null
  type: NotificationType
  title: string
  body?: string | null
  entityId?: string | null
  icon?: string | null
}

export async function notify(spec: NotifySpec): Promise<void> {
  try {
    // Don't notify yourself about your own actions.
    if (spec.actorId && spec.actorId === spec.userId) return

    // Write the notification and collect the user's devices in one round trip.
    const [, devices] = await Promise.all([
      db.notification.create({
        data: {
          userId: spec.userId,
          actorId: spec.actorId ?? null,
          type: spec.type,
          title: spec.title,
          body: spec.body ?? null,
          entityId: spec.entityId ?? null,
          icon: spec.icon ?? null,
        },
      }),
      db.userDevice.findMany({
        where: { userId: spec.userId, enabled: true },
        select: { token: true },
      }),
    ])

    // Push to every device this person uses, not just the last one to register.
    // The type and entity travel with it: the client routes a tap on them, and a
    // push that doesn't say what it is lands the user on whatever screen is
    // hardcoded.
    if (devices.length > 0) {
      const payload = {
        title: spec.title,
        body: spec.body,
        type: spec.type,
        entityId: spec.entityId ?? null,
        // For a DM the actor is the person to open a conversation with.
        ...(spec.type === 'group_message' && spec.actorId
          ? { senderId: spec.actorId, senderName: spec.actorName ?? 'Someone' }
          : {}),
      }

      // In parallel: one slow or dead device shouldn't delay the others.
      const results = await Promise.all(
        devices.map(async (d) => ({ token: d.token, ...(await sendPush({ ...payload, token: d.token })) }))
      )

      // Retire tokens FCM says are gone for good (uninstalled, rotated). Without
      // this they accumulate and every future notification pays to retry them.
      const dead = results.filter((r) => r.tokenDead).map((r) => r.token)
      if (dead.length > 0) {
        await db.userDevice.updateMany({
          where: { token: { in: dead } },
          data: { enabled: false },
        })
      }
    }
  } catch (e) {
    console.error('notify failed (non-fatal):', e)
  }
}
