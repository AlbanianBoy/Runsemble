import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'

async function membership(groupId: string, userId: string) {
  return db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
}
async function refreshCount(groupId: string) {
  const memberCount = await db.groupMember.count({ where: { groupId } })
  await db.runGroup.update({ where: { id: groupId }, data: { memberCount } })
}

// Remove a member. Owner can remove anyone but themselves; an admin can remove
// plain members (not the owner or other admins).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    if (userId === me.id) return NextResponse.json({ error: 'Use "leave group" to remove yourself' }, { status: 400 })

    const mine = await membership(id, me.id)
    if (!mine || (mine.role !== 'owner' && mine.role !== 'admin')) {
      return NextResponse.json({ error: 'Only a group admin can remove members' }, { status: 403 })
    }
    const target = await membership(id, userId)
    if (!target) return NextResponse.json({ error: 'Not a member of this group' }, { status: 404 })
    if (target.role === 'owner') return NextResponse.json({ error: "You can't remove the owner" }, { status: 403 })
    if (mine.role === 'admin' && target.role === 'admin') {
      return NextResponse.json({ error: "Admins can't remove other admins" }, { status: 403 })
    }

    await db.groupMember.delete({ where: { groupId_userId: { groupId: id, userId } } })
    await refreshCount(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}

// Promote a member to admin or demote back to member. Owner only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id, userId } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const mine = await membership(id, me.id)
    if (!mine || mine.role !== 'owner') {
      return NextResponse.json({ error: 'Only the owner can change roles' }, { status: 403 })
    }
    const { role } = await request.json()
    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json({ error: 'role must be admin or member' }, { status: 400 })
    }
    const target = await membership(id, userId)
    if (!target) return NextResponse.json({ error: 'Not a member of this group' }, { status: 404 })
    if (target.role === 'owner') return NextResponse.json({ error: "You can't change the owner's role" }, { status: 403 })

    await db.groupMember.update({ where: { groupId_userId: { groupId: id, userId } }, data: { role } })

    if (role === 'admin') {
      const group = await db.runGroup.findUnique({ where: { id }, select: { name: true } })
      await notify({
        userId, actorId: me.id, type: 'group_role',
        title: `You're now an admin of ${group?.name ?? 'a group'} ⭐`,
        body: 'You can manage members and edit the group.',
        entityId: id, icon: '⭐',
      })
    }
    return NextResponse.json({ ok: true, role })
  } catch (error) {
    console.error('Error changing member role:', error)
    return NextResponse.json({ error: 'Failed to change role' }, { status: 500 })
  }
}
