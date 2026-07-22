import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { readJson } from '@/lib/http'

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
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const { userId } = parsed.body
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // Only members can add people (mirrors the write-side checks elsewhere).
    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!membership) return NextResponse.json({ error: 'Only members can add people' }, { status: 403 })

    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: userId },
          { blockerId: userId, blockedId: me.id },
        ],
      },
    })
    if (blocked) return NextResponse.json({ error: 'Cannot add this user' }, { status: 403 })

    const existing = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    })
    if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 })

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
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}
