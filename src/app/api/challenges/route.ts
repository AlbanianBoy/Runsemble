import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Community challenges. Progress is computed on read from RunSessions/Buddies in
// the challenge window, so there is never a counter to keep in sync.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const now = new Date()

    const challenges = await db.challenge.findMany({
      where: { endsAt: { gte: now } },
      include: { participants: { select: { userId: true } } },
      orderBy: { endsAt: 'asc' },
    })

    async function progressFor(
      metric: string,
      userIds: string[],
      startsAt: Date,
      endsAt: Date
    ): Promise<number> {
      if (userIds.length === 0) return 0
      const range = { gte: startsAt, lte: endsAt }
      if (metric === 'runs') {
        return db.runSession.count({ where: { userId: { in: userIds }, endedAt: range } })
      }
      if (metric === 'buddies') {
        return db.buddy.count({ where: { userId: { in: userIds }, createdAt: range } })
      }
      // distance
      const agg = await db.runSession.aggregate({
        where: { userId: { in: userIds }, endedAt: range },
        _sum: { distanceKm: true },
      })
      return Math.round((agg._sum.distanceKm ?? 0) * 10) / 10
    }

    const shaped = await Promise.all(
      challenges.map(async (c) => {
        const participantIds = c.participants.map((p) => p.userId)
        const joined = !!userId && participantIds.includes(userId)
        const totalProgress = await progressFor(c.metric, participantIds, c.startsAt, c.endsAt)
        const myProgress = userId ? await progressFor(c.metric, [userId], c.startsAt, c.endsAt) : 0
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          metric: c.metric,
          goal: c.goal,
          scope: c.scope,
          groupId: c.groupId,
          icon: c.icon,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          participantCount: participantIds.length,
          joined,
          myProgress,
          totalProgress,
        }
      })
    )

    return NextResponse.json({ challenges: shaped })
  } catch (error) {
    console.error('Error fetching challenges:', error)
    return NextResponse.json({ error: 'Failed to fetch challenges' }, { status: 500 })
  }
}
