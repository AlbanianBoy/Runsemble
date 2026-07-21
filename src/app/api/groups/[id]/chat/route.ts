import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { LIMITS, overLimit } from '@/lib/limits'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Must be a group member to view chat' }, { status: 403 })
    }

    const messages = await db.chatMessage.findMany({
      where: { groupId: id },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ messages: messages.reverse() })
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json({ error: 'Failed to fetch chat messages' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const senderId = me.id

    const body = await request.json()
    const { content } = body
    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    if (overLimit(content, LIMITS.message)) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: senderId } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Must be a group member to send messages' }, { status: 403 })
    }

    const message = await db.chatMessage.create({
      data: { groupId: id, senderId, content },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    // Tell the other members — group chat used to create the row and notify
    // nobody, so a message only arrived if someone happened to have the chat
    // open. Fan-out runs AFTER the response via after(), so a big group doesn't
    // make the sender wait on N notification writes + pushes.
    after(async () => {
      const others = await db.groupMember.findMany({
        where: { groupId: id, userId: { not: senderId } },
        select: { userId: true },
      })
      await Promise.all(
        others.map((m) =>
          notify({
            userId: m.userId,
            actorId: senderId,
            type: 'group_chat',
            title: `${message.sender.name} in ${group.name}`,
            body: content.slice(0, 120),
            entityId: id,
            icon: '💬',
          })
        )
      )
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error sending chat message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
