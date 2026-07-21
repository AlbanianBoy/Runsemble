import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Session required, matching /api/users/[id]. Badges reveal how active
    // someone is and when they joined; anonymous enumeration of that across
    // scraped ids is exactly the profiling the profile endpoint was closed to.
    if (!(await getSessionUser())) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query parameter is required' },
        { status: 400 }
      )
    }

    const badges = await db.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    })

    return NextResponse.json({ badges })
  } catch (error) {
    console.error('Error fetching badges:', error)
    return NextResponse.json(
      { error: 'Failed to fetch badges' },
      { status: 500 }
    )
  }
}
