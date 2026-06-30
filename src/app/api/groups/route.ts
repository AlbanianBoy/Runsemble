import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

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
    const body = await request.json()

    const {
      name,
      description,
      isPublic,
      coverImage,
      city,
      createdBy,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Group name is required' },
        { status: 400 }
      )
    }

    if (!createdBy) {
      return NextResponse.json(
        { error: 'createdBy userId is required' },
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
