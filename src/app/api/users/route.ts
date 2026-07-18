import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'

export async function GET() {
  try {
    // Session required — anonymous scraping of the full social graph is not allowed.
    const viewerId = (await getSessionUser())?.id
    if (!viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Hide anyone in a block relationship with the viewer (either direction).
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    })
    const excludeIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))

    const users = await db.user.findMany({
      where: excludeIds.length ? { id: { notIn: excludeIds } } : undefined,
      orderBy: { createdAt: 'asc' },
      take: 500, // bound the query; the map/people views work on a local set
      include: {
        earnedBadges: true,
        groupMemberships: {
          include: {
            group: true,
          },
        },
        // For safe-zone suppression in toPublicUser. The projection deletes this
        // key from the payload — zone centres are home addresses and never ship.
        safeZones: { select: { lat: true, lng: true, radiusM: true } },
      },
    })

    // Public projection: no email/passwordHash/consent, coordinates snapped to
    // the ~200m privacy grid (exact coords must never reach another client).
    return NextResponse.json({ users: users.map(toPublicUser) })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// Account creation moved to /api/auth/signup (password + consent + session).
// This unauthenticated path stays closed so it can't be used to mint profiles.
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Account creation moved to /api/auth/signup' },
    { status: 410 }
  )
}
