import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { readJson, apiError } from '@/lib/http'

// Add another user to a group ("invite"). Any member can add people — this is
// what makes a private group usable: create it, then add your running buddies.
// The added person gets a notification and can leave anytime (WhatsApp-style).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const { userId } = parsed.body
    if (!userId || typeof userId !== 'string') {
      return apiError(400, 'missing_field', 'userId is required')
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) return apiError(404, 'not_found', 'Group not found')

    // Only members can add people (mirrors the write-side checks elsewhere).
    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!membership) return apiError(403, 'forbidden', 'Only members can add people')

    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
    if (!target) return apiError(404, 'not_found', 'User not found')

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: userId },
          { blockerId: userId, blockedId: me.id },
        ],
      },
    })
    if (blocked) return apiError(403, 'forbidden', 'Cannot add this user')

    const existing = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    })
    if (existing) return apiError(409, 'conflict', 'Already a member')

    await db.groupMember.create({ data: { groupId: id, userId, role: 'member' } })

    await notify({
      userId,
      actorId: me.id,
      type: 'group_added',
      title: `${me.name} added you to ${group.name}`,
      body: 'Open the group to say hi and plan a run together.',
      entityId: id,
      icon: '👥',
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('Error adding group member:', error)
    return apiError(500, 'internal', 'Failed to add member')
  }
}
