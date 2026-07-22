import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'
import { sweepHotspotReminders } from '@/lib/hotspot-reminders'
import { SPORT_TYPES, validateEnumFields, isOneOf } from '@/lib/enums'
import { apiError, readJson, boundedInt } from '@/lib/http'

// One request must never be able to walk the whole table. A city's curated
// spots plus everything genuinely upcoming fits far inside this; past the cap
// what gets dropped is the furthest-future runs, which is the right thing to
// lose from a board that sorts by "starts soonest".
const MAX_HOTSPOTS = 200

// Same numbers as /api/users on purpose — a client scoping one call to its
// viewport should get the same slice of the world from the other.
const MAX_RADIUS_KM = 100
const DEFAULT_RADIUS_KM = 25

const KM_PER_DEG_LAT = 111.32

/**
 * Mirrors the bounding box in /api/users. A box is not a circle — it over-
 * selects the corners by up to ~27% — but it's a plain range predicate on the
 * lat/lng columns the schema already has, and the map re-filters by exact
 * haversine distance anyway.
 */
function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEG_LAT
  // A degree of longitude narrows towards the poles and collapses to zero at 90°,
  // so the cosine is floored: a polar viewer gets an over-wide box instead of a
  // division by zero.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01)
  const lngDelta = radiusKm / (KM_PER_DEG_LAT * cosLat)
  const minLng = lng - lngDelta
  const maxLng = lng + lngDelta

  return {
    minLat: Math.max(lat - latDelta, -90),
    maxLat: Math.min(lat + latDelta, 90),
    minLng,
    maxLng,
    // A box straddling ±180 is two ranges, not one gte/lte pair. Dropping the
    // longitude bound keeps the latitude band, which over-selects rather than
    // hiding every spot on the far side of the line.
    wrapsAntimeridian: minLng < -180 || maxLng > 180,
  }
}

export async function GET(request?: NextRequest) {
  try {
    // Session required. This returns participantNames alongside each run's exact
    // location and start time, so unauthenticated it published "these named
    // people will be at this park at 18:30 on Wednesday" to anyone who asked —
    // no account needed. On an app whose whole risk surface is meeting strangers
    // in physical space, that is the one list that must not be scrapeable.
    // Matches /api/users, which has required a session for the same reason.
    if (!(await getSessionUser())) {
      return apiError(401, 'unauthenticated', 'Please log in')
    }

    const now = new Date()

    // The reminder sweep is a write path riding the app's most-polled read, so
    // it goes after the response rather than in front of it. It stays here
    // instead of on a cron because the cron budget is spent and a daily tick
    // can't fire a 30-minutes-before reminder.
    after(() => sweepHotspotReminders())

    // Next always supplies the request; the parameter is optional so the handler
    // stays callable bare, matching /api/users.
    const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams()

    // Empty values count as absent — callers interpolate `?lat=${x ?? ''}`.
    const rawLat = searchParams.get('lat')?.trim() ?? ''
    const rawLng = searchParams.get('lng')?.trim() ?? ''
    const rawRadius = searchParams.get('radiusKm')?.trim() ?? ''

    let box: ReturnType<typeof boundingBox> | null = null
    if (rawLat || rawLng) {
      const lat = Number(rawLat)
      const lng = Number(rawLng)
      const radiusKm = rawRadius ? Number(rawRadius) : DEFAULT_RADIUS_KM

      // Half a coordinate, or a typo'd one, would silently fall through to the
      // unscoped board. So it's a 400, not a shrug — same rule as /api/users.
      const usable =
        rawLat !== '' &&
        rawLng !== '' &&
        Number.isFinite(lat) &&
        Math.abs(lat) <= 90 &&
        Number.isFinite(lng) &&
        Math.abs(lng) <= 180 &&
        Number.isFinite(radiusKm) &&
        radiusKm > 0
      if (!usable) {
        return apiError(
          400,
          'invalid_value',
          'lat and lng must both be valid coordinates, and radiusKm positive'
        )
      }

      box = boundingBox(lat, lng, Math.min(radiusKm, MAX_RADIUS_KM))
    }

    // Visibility is still decided per-spot below; this where clause is the same
    // rule pushed into the query so a spot that expired years ago stops being
    // fetched only to be thrown away.
    const hotspots = await db.hotspot.findMany({
      where: {
        isActive: true,
        // An official spot's startTime is a recurrence anchor, not a deadline —
        // it is normally in the past, and bounding officials by it would empty
        // the board. Only one-off runs expire.
        OR: [{ isOfficial: true }, { startTime: { gte: now } }],
        // Absent lat/lng keeps the old whole-board response, so existing
        // clients are unaffected.
        ...(box
          ? {
              lat: { gte: box.minLat, lte: box.maxLat },
              ...(box.wrapsAntimeridian ? {} : { lng: { gte: box.minLng, lte: box.maxLng } }),
            }
          : {}),
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                paceLevel: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
      take: MAX_HOTSPOTS,
    })

    // Roll a recurring spot forward to its next future slot so curated city
    // spots are perpetually "coming up" rather than expiring.
    function nextByInterval(startTime: Date, intervalMin: number): Date {
      if (startTime.getTime() >= now.getTime() || intervalMin <= 0) return startTime
      const intervalMs = intervalMin * 60_000
      const elapsed = now.getTime() - startTime.getTime()
      const slots = Math.ceil(elapsed / intervalMs)
      return new Date(startTime.getTime() + slots * intervalMs)
    }

    // For weekly official runs (daysOfWeek set), find the next date that falls on
    // one of the scheduled weekdays at the run's time-of-day.
    function nextByWeek(startTime: Date, days: number[]): Date {
      const candidate = new Date(now)
      candidate.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0)
      for (let i = 0; i < 8; i++) {
        const d = new Date(candidate)
        d.setDate(candidate.getDate() + i)
        if (days.includes(d.getDay()) && d.getTime() >= now.getTime()) return d
      }
      return startTime
    }

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    function scheduleLabel(days: number[], startTime: Date, isOfficial: boolean, intervalMin: number): string | null {
      if (!isOfficial) return null
      const time = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (days.length === 7) return `Daily · ${time}`
      if (days.length > 0) return `${days.map((d) => DOW[d]).join(', ')} · ${time}`
      if (intervalMin > 0) return `Every ${intervalMin >= 60 ? `${Math.round(intervalMin / 60)}h` : `${intervalMin} min`}`
      return null
    }

    const hotspotsWithMeta = hotspots
      .map((hotspot) => {
        const isPast = hotspot.startTime.getTime() < now.getTime()
        // User-created one-off runs disappear once they've started; official
        // spots recur forward.
        if (isPast && !hotspot.isOfficial) return null

        const days = (hotspot.daysOfWeek ?? '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)

        const effectiveStart = !hotspot.isOfficial
          ? hotspot.startTime
          : days.length > 0
          ? nextByWeek(hotspot.startTime, days)
          : nextByInterval(hotspot.startTime, hotspot.recurringIntervalMin)

        const msUntil = effectiveStart.getTime() - now.getTime()
        const minutesUntil = Math.max(0, Math.round(msUntil / 60000))
        return {
          ...hotspot,
          startTime: effectiveStart,
          participantCount: hotspot.participants.length,
          participantNames: hotspot.participants.map((p) => p.user.name),
          minutesUntil,
          scheduleLabel: scheduleLabel(days, hotspot.startTime, hotspot.isOfficial, hotspot.recurringIntervalMin),
        }
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)

    return NextResponse.json({ hotspots: hotspotsWithMeta })
  } catch (error) {
    console.error('Error fetching hotspots:', error)
    return apiError(500, 'internal', 'Failed to fetch hotspots')
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body

    const invalidEnum = validateEnumFields(body, { sportType: SPORT_TYPES })
    if (invalidEnum) return apiError(400, 'invalid_value', invalidEnum)

    // Narrowed at the boundary rather than passed through as `any`. One of these
    // was a live 500: `new Date(startTime)` on a non-date yields Invalid Date,
    // which Prisma rejects at write time — so a client sending a malformed
    // timestamp got "server error" for what is plainly a bad request.
    const name = typeof body.name === 'string' ? body.name : ''
    const description = typeof body.description === 'string' ? body.description : null
    const location = typeof body.location === 'string' ? body.location : ''
    const lat = Number(body.lat)
    const lng = Number(body.lng)
    const sportType = isOneOf(SPORT_TYPES, body.sportType) ? body.sportType : 'running'
    const distanceKm = typeof body.distanceKm === 'number' && Number.isFinite(body.distanceKm)
      ? body.distanceKm
      : 5.0
    const paceRange = typeof body.paceRange === 'string' ? body.paceRange : 'any'
    const recurringIntervalMin = boundedInt(body.recurringIntervalMin, 5, 10_080, 30)
    const audience = typeof body.audience === 'string' ? body.audience : 'all'

    if (!name.trim() || !location.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return apiError(400, 'missing_field', 'name, location, lat, lng, and startTime are required')
    }

    const startTime = new Date(typeof body.startTime === 'string' || typeof body.startTime === 'number'
      ? body.startTime
      : NaN)
    if (Number.isNaN(startTime.getTime())) {
      return apiError(400, 'invalid_value', 'startTime must be a valid date')
    }
    if (overLimit(name, LIMITS.groupName) || overLimit(description, LIMITS.groupDesc) || overLimit(location, LIMITS.place)) {
      return apiError(400, 'too_long', 'A field is too long')
    }

    const hotspot = await db.hotspot.create({
      data: {
        name,
        description,
        location,
        lat,
        lng,
        sportType,
        distanceKm,
        paceRange,
        startTime,
        recurringIntervalMin,
        audience,
        isActive: true,
        createdBy: me.id,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                paceLevel: true,
              },
            },
          },
        },
      },
    })

    const now = new Date()
    const msUntil = hotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    return NextResponse.json(
      {
        hotspot: {
          ...hotspot,
          participantCount: hotspot.participants.length,
          participantNames: hotspot.participants.map((p) => p.user.name),
          minutesUntil,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating hotspot:', error)
    return apiError(500, 'internal', 'Failed to create hotspot')
  }
}
