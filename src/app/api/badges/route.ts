import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

export async function GET(request: NextRequest) {
  try {
    // Session required, matching /api/users/[id]. Badges reveal how active
    // someone is and when they joined; anonymous enumeration of that across
    // scraped ids is exactly the profiling the profile endpoint was closed to.
    if (!(await getSessionUser())) {
      return apiError(401, 'unauthenticated', 'Please log in')
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return apiError(400, 'missing_field', 'userId query parameter is required')
    }

    const badges = await db.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    })

    return NextResponse.json({ badges })
  } catch (error) {
    console.error('Error fetching badges:', error)
    return apiError(500, 'internal', 'Failed to fetch badges')
  }
}
