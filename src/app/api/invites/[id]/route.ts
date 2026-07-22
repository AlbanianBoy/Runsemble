import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { apiError, readJson } from '@/lib/http'

// Accept or decline a run invite. Recipient only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const action = parsed.body.action

    if (action !== 'accept' && action !== 'decline') {
      return apiError(400, 'invalid_value', 'action must be accept or decline')
    }

    const invite = await db.runInvite.findUnique({ where: { id } })
    if (!invite) return apiError(404, 'not_found', 'Invite not found')
    if (invite.recipientId !== me.id) {
      return apiError(403, 'forbidden', 'This invite is not yours to answer')
    }
    if (invite.status !== 'pending') {
      return apiError(409, 'conflict', 'This invite was already answered')
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
    return apiError(500, 'internal', 'Failed to answer invite')
  }
}
