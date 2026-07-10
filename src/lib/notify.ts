// ─── Notifications (server-only) ──────────────────────────────────────────────
// A tiny helper so any route can drop a notification into a user's inbox. All
// calls are best-effort — a notification failure must never break the action
// that triggered it.

import { db } from './db'

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
    await db.notification.create({
      data: {
        userId: spec.userId,
        actorId: spec.actorId ?? null,
        type: spec.type,
        title: spec.title,
        body: spec.body ?? null,
        entityId: spec.entityId ?? null,
        icon: spec.icon ?? null,
      },
    })
  } catch (e) {
    console.error('notify failed (non-fatal):', e)
  }
}
