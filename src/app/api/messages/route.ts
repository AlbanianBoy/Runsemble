import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'

// 1:1 direct messages. Private — identity always comes from the session.
//   GET ?withId=  → the conversation with that person (marks read)
//   GET           → conversation list (latest message per partner + unread)
//   POST { recipientId, content }
export async function GET(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id
    const { searchParams } = new URL(request.url)
    const withId = searchParams.get('withId')

    if (withId) {
      const messages = await db.chatMessage.findMany({
        where: {
          recipientId: { not: null },
          OR: [
            { senderId: userId, recipientId: withId },
            { senderId: withId, recipientId: userId },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
      // Mark the ones sent to me as read.
      await db.chatMessage.updateMany({
        where: { senderId: withId, recipientId: userId, read: false },
        data: { read: true },
      })
      return NextResponse.json({ messages })
    }

    // Conversation list — collapse to the latest message per partner.
    const all = await db.chatMessage.findMany({
      where: {
        recipientId: { not: null },
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    })

    const byPartner = new Map<string, { lastMessage: string; createdAt: Date; unread: number }>()
    for (const m of all) {
      const partnerId = m.senderId === userId ? m.recipientId! : m.senderId
      const entry = byPartner.get(partnerId)
      if (!entry) {
        byPartner.set(partnerId, {
          lastMessage: m.content,
          createdAt: m.createdAt,
          unread: m.recipientId === userId && !m.read ? 1 : 0,
        })
      } else if (m.recipientId === userId && !m.read) {
        entry.unread++
      }
    }

    const partnerIds = [...byPartner.keys()]
    const partners = await db.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true, avatar: true },
    })
    const partnerMap = new Map(partners.map((p) => [p.id, p]))

    const conversations = partnerIds
      .map((id) => ({ partner: partnerMap.get(id), ...byPartner.get(id)! }))
      .filter((c) => c.partner)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)
    return NextResponse.json({ conversations, totalUnread })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const senderId = me.id

    const { recipientId, content } = await request.json()
    if (!recipientId || !content?.trim()) {
      return NextResponse.json({ error: 'recipientId and content are required' }, { status: 400 })
    }
    if (overLimit(content, LIMITS.message)) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: recipientId, blockedId: senderId },
          { blockerId: senderId, blockedId: recipientId },
        ],
      },
    })
    if (blocked) return NextResponse.json({ error: 'Cannot message this user' }, { status: 403 })

    const message = await db.chatMessage.create({
      data: { senderId, recipientId, content: content.trim() },
    })

    const sender = await db.user.findUnique({ where: { id: senderId }, select: { name: true } })
    await notify({
      userId: recipientId,
      actorId: senderId,
      type: 'group_message',
      title: `${sender?.name ?? 'Someone'} messaged you`,
      body: content.trim().slice(0, 60),
      entityId: senderId,
      icon: '✉️',
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
