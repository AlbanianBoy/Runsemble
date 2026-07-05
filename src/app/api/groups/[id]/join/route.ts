import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

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
