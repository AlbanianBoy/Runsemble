import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { requireVerifiedEmail } from '@/lib/capabilities'
import { notify } from '@/lib/notify'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError, boundedString, readJson, MAX_ID_LENGTH } from '@/lib/http'

// Run invites — the app's "add people" mechanic. Instead of a friend request,
// you invite someone to run. Identity always from the session.

// List your pending invites, both directions.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const [received, sent] = await Promise.all([
      db.runInvite.findMany({
        where: { recipientId: me.id, status: 'pending' },
        include: { sender: { select: { id: true, name: true, avatar: true, paceLevel: true, city: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.runInvite.findMany({
        where: { senderId: me.id, status: 'pending' },
        include: { recipient: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    return NextResponse.json({ received, sent })
  } catch (error) {
    console.error('Error fetching invites:', error)
    return apiError(500, 'internal', 'Failed to fetch invites')
  }
}

// Send a run invite.
export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // An invite notifies a stranger you picked off the map. Hourly, because
    // twenty invites in an hour is already more than anyone runs.
    if (!(await checkRateLimit(userKey('invite', me.id), 20, 60 * 60_000))) {
      return apiError(429, 'rate_limited', "You're doing that a lot — take a breather and try again")
    }

    // Anything that lands in someone else's notifications needs a confirmed
    // address behind it — see lib/capabilities.
    const unverified = requireVerifiedEmail(me)
    if (unverified) return unverified

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response

    const { message } = parsed.body
    const recipientId = boundedString(parsed.body.recipientId, MAX_ID_LENGTH)
    if (!recipientId) {
      return apiError(400, 'missing_field', 'recipientId is required')
    }
    if (recipientId === me.id) {
      return apiError(400, 'invalid_value', "You can't invite yourself")
    }
    if (overLimit(message, LIMITS.message)) {
      return apiError(400, 'too_long', 'Message is too long')
    }

    const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true } })
    if (!recipient) return apiError(404, 'not_found', 'User not found')

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: recipientId },
          { blockerId: recipientId, blockedId: me.id },
        ],
      },
    })
    if (blocked) return apiError(403, 'forbidden', 'Cannot invite this user')

    // One pending invite per direction, so you can't spam someone.
    const existing = await db.runInvite.findFirst({
      where: { senderId: me.id, recipientId, status: 'pending' },
    })
    if (existing) {
      // 'conflict' is the code the invite button should be reading, instead of
      // matching 'already' in this sentence the way the hotspot join does.
      return apiError(409, 'conflict', 'You already have a pending invite to this person')
    }

    const trimmed = typeof message === 'string' ? message.trim() : null
    const invite = await db.runInvite.create({
      data: { senderId: me.id, recipientId, message: trimmed || null, status: 'pending' },
    })

    await notify({
      userId: recipientId,
      actorId: me.id,
      type: 'run_invite',
      title: `${me.name} invited you to run 🏃`,
      body: trimmed?.slice(0, 60) || 'Tap to accept and plan a run together.',
      entityId: invite.id,
      icon: '🏃',
    })

    return NextResponse.json({ invite }, { status: 201 })
  } catch (error) {
    console.error('Error sending invite:', error)
    return apiError(500, 'internal', 'Failed to send invite')
  }
}
