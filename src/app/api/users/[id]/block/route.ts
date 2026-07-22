import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

// Block (or report+block) a user. `id` is the person being blocked.
// A reason turns it into a report; the effect (hide + prevent contact) is the same.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const blockerId = me.id
    const { reason = null } = await request.json().catch(() => ({}))
    if (blockerId === blockedId) return apiError(400, 'invalid_value', 'Cannot block yourself')

    await db.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, reason },
      update: { reason },
    })

    return NextResponse.json({ ok: true, reported: !!reason })
  } catch (error) {
    console.error('Error blocking user:', error)
    return apiError(500, 'internal', 'Failed to block user')
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    await db.block.deleteMany({ where: { blockerId: me.id, blockedId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error unblocking user:', error)
    return apiError(500, 'internal', 'Failed to unblock user')
  }
}
