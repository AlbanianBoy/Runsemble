import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// List YOUR notifications (newest first) plus the unread count. Session only.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

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

// Mark YOUR notifications read: all of them, or { ids: [...] } (own only).
export async function PATCH(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { ids } = body

    if (Array.isArray(ids) && ids.length > 0) {
      // Scoped to the session user so nobody can mark someone else's read.
      await db.notification.updateMany({
        where: { id: { in: ids }, userId: me.id },
        data: { read: true },
      })
    } else {
      await db.notification.updateMany({
        where: { userId: me.id, read: false },
        data: { read: true },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating notifications:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
