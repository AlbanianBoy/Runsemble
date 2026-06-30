import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      )
    }

    const existing = await db.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Already a member of this group' },
        { status: 409 }
      )
    }

    await db.groupMember.create({
      data: {
        groupId: id,
        userId,
        role: 'member',
      },
    })

    // Update member count
    const memberCount = await db.groupMember.count({
      where: { groupId: id },
    })
    await db.runGroup.update({
      where: { id },
      data: { memberCount },
    })

    const updatedGroup = await db.runGroup.findUnique({
      where: { id },
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

    return NextResponse.json({ group: updatedGroup })
  } catch (error) {
    console.error('Error joining group:', error)
    return NextResponse.json(
      { error: 'Failed to join group' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query param is required' },
        { status: 400 }
      )
    }

    const member = await db.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId },
      },
    })

    if (!member) {
      return NextResponse.json(
        { error: 'Not a member of this group' },
        { status: 404 }
      )
    }

    // Prevent owners from leaving (they should transfer ownership first)
    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Owner cannot leave. Transfer ownership first.' },
        { status: 400 }
      )
    }

    await db.groupMember.delete({
      where: {
        groupId_userId: { groupId: id, userId },
      },
    })

    // Update member count
    const memberCount = await db.groupMember.count({
      where: { groupId: id },
    })
    await db.runGroup.update({
      where: { id },
      data: { memberCount },
    })

    const updatedGroup = await db.runGroup.findUnique({
      where: { id },
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

    return NextResponse.json({ group: updatedGroup })
  } catch (error) {
    console.error('Error leaving group:', error)
    return NextResponse.json(
      { error: 'Failed to leave group' },
      { status: 500 }
    )
  }
}
