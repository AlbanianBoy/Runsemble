import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, toSafeUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'
import { LIMITS, overLimit } from '@/lib/limits'
import { readJson, parseNullableDate } from '@/lib/http'
import {
  PACE_LEVELS,
  SCHEDULE_PREFERENCES,
  GENDERS,
  validateEnumFields,
  validateCsvEnumFields,
  AVAILABILITY_AUDIENCES,
} from '@/lib/enums'

// The allowlist further down governs which *fields* a client may set, not which
// values — so without these checks a bad value reaches Prisma and surfaces as a
// 500 instead of a 400.
//
// paceLevel is a single enum value.
const ENUM_FIELDS = {
  paceLevel: PACE_LEVELS,
  gender: GENDERS,
  // Who may see you're free to run. Validated here so a typo'd value can't be
  // stored — canSeeAvailability fails closed on anything it doesn't recognise,
  // so a bad write would silently hide the user's availability from everyone.
  availabilityAudience: AVAILABILITY_AUDIENCES,
}
// schedulePreference is NOT one value. Onboarding is multi-select — you might run
// mornings and evenings — so it's a comma-separated set in a plain String column
// ("morning,evening"), and "" means no preference. Validating it as a single enum
// rejected every multi-select answer, which was the whole point of the feature.
const CSV_ENUM_FIELDS = { schedulePreference: SCHEDULE_PREFERENCES }

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Profiles are for logged-in runners only. Left open, this endpoint let
    // anyone walk a list of scraped user ids and collect a stranger's habits.
    const me = await getSessionUser()
    if (!me) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }
    const isSelf = me.id === id

    const user = await db.user.findUnique({
      where: { id },
      include: {
        earnedBadges: {
          orderBy: { earnedAt: 'desc' },
        },
        // Groups and hotspot history are only ever your own. toPublicUser passes
        // relations through untouched, so the guard has to be the query: which
        // groups someone is in and which meetups they attend is a schedule, and
        // a schedule plus a map is how you wait for a person.
        groupMemberships: isSelf
          ? { include: { group: true }, orderBy: { joinedAt: 'desc' as const } }
          : false,
        joinedHotspots: isSelf
          ? { include: { hotspot: true }, orderBy: { joinedAt: 'desc' as const }, take: 10 }
          : false,
        // Safe-zone suppression. toPublicUser deletes the key for foreign
        // viewers; the owner's own view (toSafeUser) keeps it — you may see
        // your own zones. Still only fetched for the owner.
        safeZones: isSelf
          ? { select: { id: true, name: true, lat: true, lng: true, radiusM: true } }
          : true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Own profile: everything except the hash. Anyone else: public fields only,
    // with coordinates snapped to the privacy grid.
    const payload = isSelf
      ? toSafeUser(user)
      : toPublicUser(user, me ? { id: me.id, gender: me.gender } : null)
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
    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    if (overLimit(body.name, LIMITS.name) || overLimit(body.bio, LIMITS.bio)) {
      return NextResponse.json({ error: 'Name or bio is too long' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invalid =
      validateEnumFields(body, ENUM_FIELDS) ?? validateCsvEnumFields(body, CSV_ENUM_FIELDS)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    // Build update data from provided fields
    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'avatar',
      'bio',
      'city',
      'gender',
      'preferredSport',
      'paceLevel',
      'schedulePreference',
      'isAvailable',
      'availableFrom',
      'availableUntil',
      'privacyVisible',
      'availabilityAudience',
      'analyticsConsent', // withdrawing/granting analytics consent from settings
      'onboardingComplete',
      'lastActiveDate',
      'lat',
      'lng',
      // NOTE: push tokens are NOT here. They live in UserDevice (one row per
      // device) and are registered via /api/push-token — a user has several at
      // once, so a single field on the user could only ever hold the last one.
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

    // Availability timestamps: null clears them, a bad value is a 400 rather
    // than an Invalid Date that Prisma rejects as a 500.
    for (const field of ['availableUntil', 'availableFrom'] as const) {
      if (body[field] === undefined) continue
      const result = parseNullableDate(body[field])
      if (!result.ok) {
        return NextResponse.json({ error: `${field} must be a date or null` }, { status: 400 })
      }
      updateData[field] = result.date
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
    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    if (overLimit(body.name, LIMITS.name) || overLimit(body.bio, LIMITS.bio)) {
      return NextResponse.json({ error: 'Name or bio is too long' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const invalid =
      validateEnumFields(body, ENUM_FIELDS) ?? validateCsvEnumFields(body, CSV_ENUM_FIELDS)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name',
      'avatar',
      'bio',
      'city',
      'gender',
      'preferredSport',
      'paceLevel',
      'schedulePreference',
      'isAvailable',
      'availableFrom',
      'availableUntil',
      'privacyVisible',
      'availabilityAudience',
      'analyticsConsent', // withdrawing/granting analytics consent from settings
      'onboardingComplete',
      'lastActiveDate',
      'lat',
      'lng',
      // NOTE: push tokens are NOT here. They live in UserDevice (one row per
      // device) and are registered via /api/push-token — a user has several at
      // once, so a single field on the user could only ever hold the last one.
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
    for (const field of ['availableUntil', 'availableFrom'] as const) {
      if (body[field] === undefined) continue
      const result = parseNullableDate(body[field])
      if (!result.ok) {
        return NextResponse.json({ error: `${field} must be a date or null` }, { status: 400 })
      }
      updateData[field] = result.date
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
