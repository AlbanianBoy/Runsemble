import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const group = await db.runGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                bio: true,
                paceLevel: true,
                streak: true,
                totalRuns: true,
                xp: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        posts: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            chatMessages: true,
            members: true,
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      )
    }

    // Same honest weekly-km computation as the list endpoint.
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekly = await db.runSession.groupBy({
      by: ['userId'],
      where: { userId: { in: group.members.map((m) => m.userId) }, endedAt: { gte: weekStart } },
      _sum: { distanceKm: true },
    })
    const totalKmThisWeek =
      Math.round(weekly.reduce((s, w) => s + (w._sum.distanceKm ?? 0), 0) * 10) / 10

    return NextResponse.json({
      group: {
        ...group,
        memberCount: group.members.length,
        totalMessages: group._count.chatMessages,
        totalKmThisWeek,
      },
    })
  } catch (error) {
    console.error('Error fetching group:', error)
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    )
  }
}
