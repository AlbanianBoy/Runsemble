import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

// GDPR data portability: everything we hold about you, as one JSON document.
// Session only — your data is only ever handed to *you*.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = user.id

    const [runs, posts, comments, likes, badges, buddies, notifications, messages, participations, memberships, ratings, challenges, groupChats, invites, safeZones, blocks, devices, reports] =
      await Promise.all([
        db.runSession.findMany({ where: { userId } }),
        db.feedPost.findMany({ where: { authorId: userId } }),
        db.postComment.findMany({ where: { authorId: userId } }),
        db.postLike.findMany({ where: { userId } }),
        db.userBadge.findMany({ where: { userId } }),
        db.buddy.findMany({ where: { userId } }),
        db.notification.findMany({ where: { userId } }),
        // DMs and group messages share the ChatMessage table: groupId is null for
        // a DM, set for group chat. Keep them split so each export key means what
        // its name says.
        db.chatMessage.findMany({
          where: { groupId: null, OR: [{ senderId: userId }, { recipientId: userId }] },
        }),
        db.hotspotParticipant.findMany({ where: { userId } }),
        db.groupMember.findMany({ where: { userId } }),
        db.runRating.findMany({ where: { userId } }),
        db.challengeParticipant.findMany({ where: { userId } }),
        db.chatMessage.findMany({ where: { senderId: userId, groupId: { not: null } } }),
        db.runInvite.findMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } }),
        // Safe zones are the single most sensitive thing we hold — they're home
        // and work addresses — and they were missing from the export entirely.
        // An access request that omits them isn't complete (Art. 15).
        db.safeZone.findMany({ where: { userId } }),
        // Who you've blocked is your data too (the reverse direction is the other
        // person's, so only the blocker side is exported).
        db.block.findMany({ where: { blockerId: userId } }),
        db.userDevice.findMany({
          where: { userId },
          // The push token is a device credential, not useful to the subject.
          select: { id: true, platform: true, enabled: true, lastSeenAt: true, createdAt: true },
        }),
        db.report.findMany({ where: { reporterId: userId } }),
      ])

    return new NextResponse(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          profile: toSafeUser(user),
          runs, posts, comments, likes, badges, buddies,
          notifications, messages, participations, memberships, ratings, challenges,
          groupChats, invites, safeZones, blocks, devices, reports,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="runsemble-data.json"',
        },
      }
    )
  } catch (error) {
    console.error('Error exporting data:', error)
    return apiError(500, 'internal', 'Failed to export data')
  }
}
