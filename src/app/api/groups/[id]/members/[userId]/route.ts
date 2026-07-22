import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { readJson, apiError } from '@/lib/http'

async function membership(groupId: string, userId: string) {
  return db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
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
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    if (userId === me.id) return apiError(400, 'invalid_value', 'Use "leave group" to remove yourself')

    const mine = await membership(id, me.id)
    if (!mine || (mine.role !== 'owner' && mine.role !== 'admin')) {
      return apiError(403, 'forbidden', 'Only a group admin can remove members')
    }
    const target = await membership(id, userId)
    if (!target) return apiError(404, 'not_found', 'Not a member of this group')
    if (target.role === 'owner') return apiError(403, 'forbidden', "You can't remove the owner")
    if (mine.role === 'admin' && target.role === 'admin') {
      return apiError(403, 'forbidden', "Admins can't remove other admins")
    }

    await db.groupMember.delete({ where: { groupId_userId: { groupId: id, userId } } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return apiError(500, 'internal', 'Failed to remove member')
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
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const mine = await membership(id, me.id)
    if (!mine || mine.role !== 'owner') {
      return apiError(403, 'forbidden', 'Only the owner can change roles')
    }
    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const { role } = parsed.body
    if (role !== 'admin' && role !== 'member') {
      return apiError(400, 'invalid_value', 'role must be admin or member')
    }
    const target = await membership(id, userId)
    if (!target) return apiError(404, 'not_found', 'Not a member of this group')
    if (target.role === 'owner') return apiError(403, 'forbidden', "You can't change the owner's role")

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
    return apiError(500, 'internal', 'Failed to change role')
  }
}
