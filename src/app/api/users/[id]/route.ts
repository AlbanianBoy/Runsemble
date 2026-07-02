import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const user = await db.user.findUnique({
      where: { id },
      include: {
        earnedBadges: {
          orderBy: { earnedAt: 'desc' },
        },
        groupMemberships: {
          include: {
            group: true,
          },
          orderBy: { joinedAt: 'desc' },
        },
        joinedHotspots: {
          include: {
            hotspot: true,
          },
          orderBy: { joinedAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Build update data from provided fields
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'avatar',
      'bio',
      'city',
      'preferredSport',
      'paceLevel',
      'schedulePreference',
      'isAvailable',
      'availableUntil',
      'privacyVisible',
      'onboardingComplete',
      'xp',
      'streak',
      'longestStreak',
      'lastActiveDate',
      'totalRuns',
      'totalPeopleRunWith',
      'lat',
      'lng',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Handle availableUntil as a Date
    if (body.availableUntil) {
      updateData.availableUntil = new Date(body.availableUntil)
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      include: {
        earnedBadges: true,
        groupMemberships: {
          include: { group: true },
        },
      },
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'avatar',
      'bio',
      'city',
      'preferredSport',
      'paceLevel',
      'schedulePreference',
      'isAvailable',
      'availableUntil',
      'privacyVisible',
      'onboardingComplete',
      'xp',
      'streak',
      'longestStreak',
      'lastActiveDate',
      'totalRuns',
      'totalPeopleRunWith',
      'lat',
      'lng',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (body.availableUntil) {
      updateData.availableUntil = new Date(body.availableUntil)
    }
    if (body.isAvailable === false) {
      updateData.availableUntil = null
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      include: {
        earnedBadges: true,
        groupMemberships: {
          include: { group: true },
        },
      },
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}