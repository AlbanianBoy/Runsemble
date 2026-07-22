import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return apiError(404, 'not_found', 'Group not found')
    }

    // Private groups are invite-only — a member adds you via /members. Anyone
    // with the id could otherwise self-join a private group.
    if (!group.isPublic) {
      return apiError(403, 'forbidden', 'This group is private — a member needs to add you')
    }

    const existing = await db.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId },
      },
    })

    if (existing) {
      return apiError(409, 'conflict', 'Already a member of this group')
    }

    await db.groupMember.create({
      data: {
        groupId: id,
        userId,
        role: 'member',
      },
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
    return apiError(500, 'internal', 'Failed to join group')
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    const member = await db.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId },
      },
    })

    if (!member) {
      return apiError(404, 'not_found', 'Not a member of this group')
    }

    // Prevent owners from leaving (they should transfer ownership first)
    if (member.role === 'owner') {
      return apiError(400, 'precondition_failed', 'Owner cannot leave. Transfer ownership first.')
    }

    await db.groupMember.delete({
      where: {
        groupId_userId: { groupId: id, userId },
      },
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
    return apiError(500, 'internal', 'Failed to leave group')
  }
}
