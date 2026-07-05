import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// YOUR run buddies — people you've actually run with. Session only.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const rows = await db.buddy.findMany({
      where: { userId },
      include: {
        buddy: {
          select: {
            id: true,
            name: true,
            avatar: true,
            city: true,
            paceLevel: true,
            xp: true,
            streak: true,
            isAvailable: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ buddies: rows.map((r) => r.buddy) })
  } catch (error) {
    console.error('Error fetching buddies:', error)
    return NextResponse.json({ error: 'Failed to fetch buddies' }, { status: 500 })
  }
}
