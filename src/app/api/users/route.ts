import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'

export async function GET() {
  try {
    // Return all users for feed and social features.
    // Map-visible users are filtered client-side using isAvailable && privacyVisible.
    // Block filtering is based on the session, not a client-claimed viewer id.
    const viewerId = (await getSessionUser())?.id ?? null

    // Hide anyone in a block relationship with the viewer (either direction).
    let excludeIds: string[] = []
    if (viewerId) {
      const blocks = await db.block.findMany({
        where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
        select: { blockerId: true, blockedId: true },
      })
      excludeIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
    }

    const users = await db.user.findMany({
      where: excludeIds.length ? { id: { notIn: excludeIds } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        earnedBadges: true,
        groupMemberships: {
          include: {
            group: true,
          },
        },
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
