// ─── What a push means ────────────────────────────────────────────────────────
// A push is the server saying "something happened". Two things follow from that,
// and both used to be missed:
//
//   Tapped   → go where the thing is. Every tap used to land on the Groups tab,
//              so "you earned a badge" and "someone liked your run" both took
//              you to your conversations.
//   Arrived  → the data it describes is now stale. Nothing listened, so a DM
//              already delivered to the device still waited up to 5s for the
//              next poll to notice.
//
// Pure on purpose: the interesting part is the mapping, and this way it can be
// tested without pretending to be a phone.

export type PushTab = 'feed' | 'map' | 'hotspots' | 'groups' | 'profile'

/**
 * Every kind of notification the server can send.
 *
 * It lives here, in the file with no dependencies, and notify.ts imports it —
 * rather than the other way round, which would drag the database client into
 * the browser bundle. That direction also buys the guarantee below.
 *
 * The two maps are keyed on this union rather than on `string`, so adding a
 * notification type without telling the router where it goes is a build error
 * instead of a tap that silently lands on the wrong tab. Four types were added
 * in one week recently; the next person adding one shouldn't have to know these
 * tables exist.
 */
export type NotificationType =
  | 'hotspot_join'
  | 'hotspot_reminder'
  | 'run_invite'
  | 'group_message'
  | 'group_chat'
  | 'group_added'
  | 'group_role'
  | 'group_run_started'
  | 'badge'
  | 'rank_up'
  | 'comment'
  | 'like'
  | 'run_complete'

const TAB_BY_TYPE: Record<NotificationType, PushTab> = {
  group_message: 'groups', // DMs live under Groups
  group_chat: 'groups',
  group_added: 'groups',
  group_role: 'groups',
  group_run_started: 'groups',
  like: 'feed',
  comment: 'feed',
  badge: 'profile',
  rank_up: 'profile',
  run_complete: 'profile',
  run_invite: 'groups',
  hotspot_join: 'hotspots',
  hotspot_reminder: 'hotspots',
}

/**
 * Where tapping this notification should land.
 *
 * Groups is the fallback because that's where an unrecognised social event most
 * likely belongs — but an unknown type is a mapping gap, not a Groups event.
 */
export function tabForPush(type: string | undefined): PushTab {
  return (type && TAB_BY_TYPE[type as NotificationType]) || 'groups'
}

/** True when tapping this push should open a DM, given the payload carries a sender. */
export function isDmPush(data: { type?: string; senderId?: string; senderName?: string }): boolean {
  return data.type === 'group_message' && !!data.senderId && !!data.senderName
}

const KEYS_BY_TYPE: Record<NotificationType, string[]> = {
  group_message: ['conversations', 'dm'],
  group_chat: ['group-chat', 'groups'],
  group_added: ['groups'],
  group_role: ['groups', 'group'],
  group_run_started: ['groups', 'group'],
  like: ['feed'],
  comment: ['feed'],
  badge: ['badges', 'users'],
  rank_up: ['users', 'leaderboard'],
  run_complete: ['runs'],
  run_invite: ['invites'],
  hotspot_join: ['hotspots'],
  hotspot_reminder: ['hotspots'],
}

/**
 * Query keys a push of this type makes stale.
 *
 * 'notifications' is always included — every push writes a notification row, so
 * the bell is stale no matter what else changed.
 */
export function queryKeysForPush(type: string | undefined): string[] {
  const specific = (type && KEYS_BY_TYPE[type as NotificationType]) || []
  return ['notifications', ...specific]
}
