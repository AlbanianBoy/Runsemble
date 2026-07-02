import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Return all users for feed and social features.
    // Map-visible users are filtered client-side using isAvailable && privacyVisible.
    const { searchParams } = new URL(request.url)
    const viewerId = searchParams.get('viewerId')

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

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      name,
      email,
      avatar,
      bio,
      city,
      preferredSport,
      paceLevel,
      schedulePreference,
      lat,
      lng,
    } = body

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      )
    }

    // Check if user with email already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      )
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        avatar: avatar ?? null,
        bio: bio ?? null,
        city: city ?? 'Antwerp',
        preferredSport: preferredSport ?? 'running',
        paceLevel: paceLevel ?? 'beginner',
        schedulePreference: schedulePreference ?? 'evening',
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        onboardingComplete: true,
        isAvailable: false,
        privacyVisible: true,
      },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
}
