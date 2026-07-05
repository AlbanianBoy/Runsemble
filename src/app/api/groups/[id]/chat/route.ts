import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      )
    }

    const messages = await db.groupChatMessage.findMany({
      where: { groupId: id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ messages: messages.reverse() })
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat messages' },
      { status: 500 }
    )
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
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      )
    }

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      )
    }

    // Verify the sender is a member of the group
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: id, userId: senderId },
      },
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Must be a group member to send messages' },
        { status: 403 }
      )
    }

    const message = await db.groupChatMessage.create({
      data: {
        groupId: id,
        senderId,
        content,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error sending chat message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
