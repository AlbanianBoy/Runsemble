import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'
import { readJson } from '@/lib/http'

// Shared: the requester's role in this group, or null if not a member.
async function roleIn(groupId: string, userId: string): Promise<string | null> {
  const m = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
  return m?.role ?? null
}

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

    // Private groups are visible to members only — otherwise their member list
    // and posts would be readable by anyone with the group id.
    if (!group.isPublic) {
      const me = await getSessionUser()
      const member = me
        ? await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
        : null
      if (!member) return NextResponse.json({ error: 'This group is private' }, { status: 403 })
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

// Edit a group (name / description / public). Owner or admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const role = await roleIn(id, me.id)
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Only a group admin can edit it' }, { status: 403 })
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const data: Record<string, unknown> = {}
    if (typeof body.name === 'string') {
      if (!body.name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      if (overLimit(body.name, LIMITS.groupName)) return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
      data.name = body.name.trim()
    }
    if (body.description !== undefined) {
      if (overLimit(body.description, LIMITS.groupDesc)) return NextResponse.json({ error: 'Description is too long' }, { status: 400 })
      data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
    }
    if (typeof body.isPublic === 'boolean') data.isPublic = body.isPublic
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const group = await db.runGroup.update({ where: { id }, data })
    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error editing group:', error)
    return NextResponse.json({ error: 'Failed to edit group' }, { status: 500 })
  }
}

// Delete a group. Owner only. Members + chat + group challenges cascade; shared
// posts and runs keep but detach from the group.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const role = await roleIn(id, me.id)
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can delete the group' }, { status: 403 })
    }

    await db.runGroup.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting group:', error)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
