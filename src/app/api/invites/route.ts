import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { LIMITS, overLimit } from '@/lib/limits'

// Run invites — the app's "add people" mechanic. Instead of a friend request,
// you invite someone to run. Identity always from the session.

// List your pending invites, both directions.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

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
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }
}

// Send a run invite.
export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const { recipientId, message } = await request.json()
    if (!recipientId || typeof recipientId !== 'string') {
      return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })
    }
    if (recipientId === me.id) {
      return NextResponse.json({ error: "You can't invite yourself" }, { status: 400 })
    }
    if (overLimit(message, LIMITS.message)) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }

    const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true } })
    if (!recipient) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: me.id, blockedId: recipientId },
          { blockerId: recipientId, blockedId: me.id },
        ],
      },
    })
    if (blocked) return NextResponse.json({ error: 'Cannot invite this user' }, { status: 403 })

    // One pending invite per direction, so you can't spam someone.
    const existing = await db.runInvite.findFirst({
      where: { senderId: me.id, recipientId, status: 'pending' },
    })
    if (existing) {
      return NextResponse.json({ error: 'You already have a pending invite to this person' }, { status: 409 })
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
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 })
  }
}
