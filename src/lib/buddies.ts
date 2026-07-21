// ─── Buddies: who you're allowed to say you ran with (server-only) ───────────
//
// Tagging someone as a run buddy writes a row on THEIR profile and sends them a
// push. It accepted any user id at all, so the check was "did you type a valid
// id", not "did you run with this person". Twenty strangers could be collected
// per save, each one notified, each one appearing in the tagger's buddy list —
// and the only way out for the person on the receiving end was a full block,
// which is a heavy thing to ask of someone whose only complaint is that they
// don't know you.
//
// So a tag now needs evidence. Any ONE of these is enough:
//
//   • you're already buddies          — the connection exists, nothing new is forced
//   • you both joined this hotspot    — you turned up to the same run
//   • you're both in this group       — you're in the same club
//   • one of you accepted the other's run invite — an explicit yes
//
// Deliberately generous: the aim is to make a tag mean something, not to make
// tagging your actual running partners annoying. A run with no hotspot or group
// context can still tag existing buddies and people who accepted an invite.
//
// Ineligible ids are dropped rather than rejected. A run is a thing someone
// already did, sometimes saved from a queue hours later on a flaky connection;
// refusing to store it because of who was tagged would lose real data to
// enforce a social rule. The caller is told how many were dropped so the app
// can explain itself.

import { db } from './db'

export interface BuddyEligibility {
  /** Ids that may be tagged on this run. */
  allowed: string[]
  /** Ids dropped for want of evidence — count these for the user-facing message. */
  rejected: string[]
}

export async function eligibleBuddyIds(
  userId: string,
  candidateIds: string[],
  context: { hotspotId?: string | null; groupId?: string | null }
): Promise<BuddyEligibility> {
  if (candidateIds.length === 0) return { allowed: [], rejected: [] }

  const [existing, sharedHotspot, sharedGroup, invites] = await Promise.all([
    db.buddy.findMany({
      where: { userId, buddyId: { in: candidateIds } },
      select: { buddyId: true },
    }),
    context.hotspotId
      ? db.hotspotParticipant.findMany({
          where: { hotspotId: context.hotspotId, userId: { in: candidateIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    context.groupId
      ? db.groupMember.findMany({
          where: { groupId: context.groupId, userId: { in: candidateIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    db.runInvite.findMany({
      where: {
        status: 'accepted',
        OR: [
          { senderId: userId, recipientId: { in: candidateIds } },
          { recipientId: userId, senderId: { in: candidateIds } },
        ],
      },
      select: { senderId: true, recipientId: true },
    }),
  ])

  // If the tagger joined the hotspot themselves is not checked here on purpose:
  // the run they are saving IS the evidence they were there, and the route
  // already marks their participation completed a few lines later.
  const ok = new Set<string>([
    ...existing.map((b) => b.buddyId),
    ...sharedHotspot.map((p) => p.userId),
    ...sharedGroup.map((m) => m.userId),
    ...invites.map((i) => (i.senderId === userId ? i.recipientId : i.senderId)),
  ])

  const allowed: string[] = []
  const rejected: string[] = []
  for (const id of candidateIds) (ok.has(id) ? allowed : rejected).push(id)
  return { allowed, rejected }
}
