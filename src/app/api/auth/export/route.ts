import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'

// GDPR data portability: everything we hold about you, as one JSON document.
// Session-first; falls back to an explicit userId for pre-auth demo profiles.
// TODO(hardening): drop the fallback once every account has a session.
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()
    const { searchParams } = new URL(request.url)
    const userId = sessionUser?.id ?? searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [runs, posts, comments, likes, badges, buddies, notifications, messages, participations, memberships, ratings, challenges] =
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
      ])

    return new NextResponse(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          profile: toSafeUser(user),
          runs, posts, comments, likes, badges, buddies,
          notifications, messages, participations, memberships, ratings, challenges,
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
