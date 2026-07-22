// ─── Message requests ─────────────────────────────────────────────────────────
// The other half of lib/message-access: seeing who has knocked, and answering.
//
// GET   — the requests waiting on you, with the first thing they said.
// PATCH — accept (opens the conversation, pushes resume) or decline (closes it
//         silently; they are never told, which is the whole point).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError, readJson } from '@/lib/http'
import { blockedUserIds } from '@/lib/blocks'

/** Never unbounded: this is a list of strangers, so it is the one most worth capping. */
const MAX_REQUESTS = 50

export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // Someone you blocked after they wrote should not still be queued asking
    // for your attention.
    const hidden = await blockedUserIds(me.id)

    const requests = await db.messageRequest.findMany({
      where: {
        recipientId: me.id,
        status: 'pending',
        ...(hidden.length ? { senderId: { notIn: hidden } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_REQUESTS,
      include: {
        sender: {
          select: { id: true, name: true, avatar: true, city: true, paceLevel: true, verified: true },
        },
      },
    })

    // The first message is the whole basis for deciding, so it comes with the
    // request rather than behind another tap — being asked to accept before
    // seeing what was said is not a real choice.
    const previews = await Promise.all(
      requests.map(async (r) => {
        const first = await db.chatMessage.findFirst({
          where: { senderId: r.senderId, recipientId: me.id },
          orderBy: { createdAt: 'asc' },
          select: { content: true, createdAt: true },
        })
        return {
          id: r.id,
          createdAt: r.createdAt,
          sender: r.sender,
          preview: first?.content ?? '',
          sentAt: first?.createdAt ?? r.createdAt,
        }
      })
    )

    return NextResponse.json({ requests: previews, count: previews.length })
  } catch (error) {
    console.error('Error loading message requests:', error)
    return apiError(500, 'internal', 'Failed to load requests')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response

    const senderId = typeof parsed.body.senderId === 'string' ? parsed.body.senderId : ''
    const action = parsed.body.action
    if (!senderId) return apiError(400, 'missing_field', 'senderId is required')
    if (action !== 'accept' && action !== 'decline') {
      return apiError(400, 'invalid_value', 'action must be accept or decline')
    }

    // Scoped to the recipient, so this can only ever answer a request addressed
    // to the caller — nobody can accept on someone else's behalf.
    const updated = await db.messageRequest.updateMany({
      where: { senderId, recipientId: me.id, status: 'pending' },
      data: {
        status: action === 'accept' ? 'accepted' : 'declined',
        respondedAt: new Date(),
      },
    })
    if (updated.count === 0) return apiError(404, 'not_found', 'No pending request from this person')

    // No notification either way. Accepting is visible the moment they get a
    // reply; declining is meant to be invisible, because a decline that
    // announces itself is one people are afraid to use.
    return NextResponse.json({ ok: true, status: action === 'accept' ? 'accepted' : 'declined' })
  } catch (error) {
    console.error('Error answering message request:', error)
    return apiError(500, 'internal', 'Failed to answer request')
  }
}
