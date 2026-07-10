import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'

// Accept or decline a run invite. Recipient only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const { action } = await request.json()
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 })
    }

    const invite = await db.runInvite.findUnique({ where: { id } })
    if (!invite) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    if (invite.recipientId !== me.id) {
      return NextResponse.json({ error: 'This invite is not yours to answer' }, { status: 403 })
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'This invite was already answered' }, { status: 409 })
    }

    const status = action === 'accept' ? 'accepted' : 'declined'
    await db.runInvite.update({ where: { id }, data: { status } })

    // Only tell the sender about an acceptance — a decline stays quiet.
    if (action === 'accept') {
      await notify({
        userId: invite.senderId,
        actorId: me.id,
        type: 'run_invite',
        title: `${me.name} accepted your run invite 🎉`,
        body: 'Message them to lock in a time and place!',
        entityId: me.id,
        icon: '🤝',
      })
    }

    return NextResponse.json({ ok: true, status })
  } catch (error) {
    console.error('Error answering invite:', error)
    return NextResponse.json({ error: 'Failed to answer invite' }, { status: 500 })
  }
}
