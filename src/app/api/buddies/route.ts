import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// A user's run buddies — people they've actually run with.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

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
