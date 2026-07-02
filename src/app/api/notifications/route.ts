import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// List a user's notifications (newest first) plus the unread count.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const [notifications, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        include: { actor: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { userId, read: false } }),
    ])

    return NextResponse.json({ notifications, unread })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// Mark notifications read. Pass { userId } to mark all, or { ids: [...] }.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, ids } = body

    if (Array.isArray(ids) && ids.length > 0) {
      await db.notification.updateMany({ where: { id: { in: ids } }, data: { read: true } })
    } else if (userId) {
      await db.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
    } else {
      return NextResponse.json({ error: 'userId or ids required' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
