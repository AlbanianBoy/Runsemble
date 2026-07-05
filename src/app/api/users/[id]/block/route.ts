import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Block (or report+block) a user. `id` is the person being blocked.
// A reason turns it into a report; the effect (hide + prevent contact) is the same.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const blockerId = me.id
    const { reason = null } = await request.json().catch(() => ({}))
    if (blockerId === blockedId) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

    await db.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId, reason },
      update: { reason },
    })

    return NextResponse.json({ ok: true, reported: !!reason })
  } catch (error) {
    console.error('Error blocking user:', error)
    return NextResponse.json({ error: 'Failed to block user' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: blockedId } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    await db.block.deleteMany({ where: { blockerId: me.id, blockedId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error unblocking user:', error)
    return NextResponse.json({ error: 'Failed to unblock user' }, { status: 500 })
  }
}
