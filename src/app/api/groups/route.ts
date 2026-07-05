import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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

    const groupsWithMeta = groups.map((group) => ({
      ...group,
      memberCount: group.members.length,
      messageCount: group._count.chatMessages,
      isMember: userId ? group.members.some((m: any) => m.userId === userId) : false,
      _count: undefined,
    }))

    return NextResponse.json({ groups: groupsWithMeta })
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
