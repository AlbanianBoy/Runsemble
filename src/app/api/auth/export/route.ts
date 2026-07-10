import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'

// GDPR data portability: everything we hold about you, as one JSON document.
// Session only — your data is only ever handed to *you*.
export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = user.id

    const [runs, posts, comments, likes, badges, buddies, notifications, messages, participations, memberships, ratings, challenges, groupChats, invites] =
      await Promise.all([
        db.runSession.findMany({ where: { userId } }),
        db.feedPost.findMany({ where: { authorId: userId } }),
        db.postComment.findMany({ where: { authorId: userId } }),
        db.postLike.findMany({ where: { userId } }),
        db.userBadge.findMany({ where: { userId } }),
        db.buddy.findMany({ where: { userId } }),
        db.notification.findMany({ where: { userId } }),
        db.chatMessage.findMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } }),
        db.hotspotParticipant.findMany({ where: { userId } }),
        db.groupMember.findMany({ where: { userId } }),
        db.runRating.findMany({ where: { userId } }),
        db.challengeParticipant.findMany({ where: { userId } }),
        db.groupChatMessage.findMany({ where: { senderId: userId } }),
        db.runInvite.findMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } }),
      ])

    return new NextResponse(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          profile: toSafeUser(user),
          runs, posts, comments, likes, badges, buddies,
          notifications, messages, participations, memberships, ratings, challenges,
          groupChats, invites,
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
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
