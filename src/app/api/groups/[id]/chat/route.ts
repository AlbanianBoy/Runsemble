import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError, readJson } from '@/lib/http'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return apiError(404, 'not_found', 'Group not found')
    }

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!membership) {
      return apiError(403, 'forbidden', 'Must be a group member to view chat')
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
    return apiError(500, 'internal', 'Failed to fetch chat messages')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const senderId = me.id

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const content = typeof parsed.body.content === 'string' ? parsed.body.content : ''
    if (!content.trim()) {
      return apiError(400, 'missing_field', 'content is required')
    }
    if (overLimit(content, LIMITS.message)) {
      return apiError(400, 'too_long', 'Message is too long')
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return apiError(404, 'not_found', 'Group not found')
    }

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: senderId } },
    })
    if (!membership) {
      return apiError(403, 'forbidden', 'Must be a group member to send messages')
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
    return apiError(500, 'internal', 'Failed to send message')
  }
}
