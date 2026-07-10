import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'

export async function GET() {
  try {
    // Membership flags come from the session, not a client-claimed id.
    const userId = (await getSessionUser())?.id ?? null

    const groups = await db.runGroup.findMany({
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            chatMessages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Honest stat: "km this week" is computed from members' real tracked runs
    // since Monday (the stored totalKmThisWeek column is legacy seed data).
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekly = await db.runSession.groupBy({
      by: ['userId'],
      where: { endedAt: { gte: weekStart } },
      _sum: { distanceKm: true },
    })
    const kmByUser = new Map(weekly.map((w) => [w.userId, w._sum.distanceKm ?? 0]))

    const groupsWithMeta = groups.map((group) => ({
      ...group,
      memberCount: group.members.length,
      messageCount: group._count.chatMessages,
      totalKmThisWeek:
        Math.round(group.members.reduce((s, m) => s + (kmByUser.get(m.userId) ?? 0), 0) * 10) / 10,
      isMember: userId ? group.members.some((m: any) => m.userId === userId) : false,
      _count: undefined,
    }))

    // Private groups only appear in the list for their members — mirrors the
    // members-only detail/chat/lobby so a private group isn't discoverable
    // (name + members) by everyone.
    const visible = groupsWithMeta.filter((g) => g.isPublic || g.isMember)
    return NextResponse.json({ groups: visible })
  } catch (error) {
    console.error('Error fetching groups:', error)
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const createdBy = me.id

    const body = await request.json()
    const { name, description, isPublic, coverImage, city } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      )
    }
    if (overLimit(name, LIMITS.groupName) || overLimit(description, LIMITS.groupDesc)) {
      return NextResponse.json({ error: 'Group name or description is too long' }, { status: 400 })
    }

    const group = await db.runGroup.create({
      data: {
        name,
        description: description ?? null,
        isPublic: isPublic ?? true,
        coverImage: coverImage ?? null,
        city: city ?? 'Antwerp',
        memberCount: 1,
        createdBy,
        members: {
          create: {
            userId: createdBy,
            role: 'owner',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    )
  }
}
