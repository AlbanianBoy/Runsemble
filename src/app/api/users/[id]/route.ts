import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'
import { LIMITS, overLimit } from '@/lib/limits'

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

    // Own profile: everything except the hash. Anyone else: public fields only,
    // with coordinates snapped to the privacy grid.
    const me = await getSessionUser()
    const payload = me?.id === user.id ? toSafeUser(user) : toPublicUser(user)
    return NextResponse.json({ user: payload })
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
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    if (me.id !== id) return NextResponse.json({ error: 'You can only edit your own profile' }, { status: 403 })
    const body = await request.json()
    if (overLimit(body.name, LIMITS.name) || overLimit(body.bio, LIMITS.bio)) {
      return NextResponse.json({ error: 'Name or bio is too long' }, { status: 400 })
    }

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
      'availableFrom',
      'availableUntil',
      'privacyVisible',
      'onboardingComplete',
      'lastActiveDate',
      'lat',
      'lng',
      // NOTE: xp / streak / longestStreak / totalRuns / totalPeopleRunWith are
      // deliberately NOT here. They are moved only by the server (in /api/runs);
      // letting a client PATCH them would let anyone set xp: 999999 and top the
      // leaderboard.
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Handle availability timestamps as Dates (null clears them)
    if (body.availableUntil !== undefined) {
      updateData.availableUntil = body.availableUntil ? new Date(body.availableUntil) : null
    }
    if (body.availableFrom !== undefined) {
      updateData.availableFrom = body.availableFrom ? new Date(body.availableFrom) : null
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

    return NextResponse.json({ user: toSafeUser(updatedUser) })
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
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    if (me.id !== id) return NextResponse.json({ error: 'You can only edit your own profile' }, { status: 403 })
    const body = await request.json()
    if (overLimit(body.name, LIMITS.name) || overLimit(body.bio, LIMITS.bio)) {
      return NextResponse.json({ error: 'Name or bio is too long' }, { status: 400 })
    }

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
      'availableFrom',
      'availableUntil',
      'privacyVisible',
      'onboardingComplete',
      'lastActiveDate',
      'lat',
      'lng',
      // NOTE: xp / streak / longestStreak / totalRuns / totalPeopleRunWith are
      // deliberately NOT here. They are moved only by the server (in /api/runs);
      // letting a client PATCH them would let anyone set xp: 999999 and top the
      // leaderboard.
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Availability timestamps as Dates (null clears them). Turning availability
    // off clears everything — unless the request is *setting* a future slot.
    if (body.availableUntil !== undefined) {
      updateData.availableUntil = body.availableUntil ? new Date(body.availableUntil) : null
    }
    if (body.availableFrom !== undefined) {
      updateData.availableFrom = body.availableFrom ? new Date(body.availableFrom) : null
    }
    if (body.isAvailable === false && body.availableFrom === undefined) {
      updateData.availableFrom = null
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

    return NextResponse.json({ user: toSafeUser(updatedUser) })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}