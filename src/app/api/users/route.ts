import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'

// A single request must never be able to walk the whole table, so the result
// stays capped. What changed is the ORDER: ordering by createdAt meant that once
// the table passed the cap, every account created after the first 500 was
// invisible to everyone, permanently. Newest-activity-first fails the other way
// — you lose the dormant accounts, not your new neighbours.
const MAX_USERS = 500

// Wide enough for a metro area. A bigger radius isn't a map view, it's a request
// for the whole user list with extra steps, so it's clamped rather than refused.
const MAX_RADIUS_KM = 100
const DEFAULT_RADIUS_KM = 25

const KM_PER_DEG_LAT = 111.32

/**
 * Bounding box around a point, in degrees. A box is not a circle — it over-
 * selects the corners by up to ~27% — but it's a plain b-tree range predicate on
 * the lat/lng columns the schema already has, and the map re-filters by exact
 * haversine distance anyway. PostGIS buys precision nothing here spends.
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
    // hiding every neighbour on the far side of the line.
    wrapsAntimeridian: minLng < -180 || maxLng > 180,
  }
}

export async function GET(request?: NextRequest) {
  try {
    // Session required — anonymous scraping of the full social graph is not allowed.
    const viewerId = (await getSessionUser())?.id
    if (!viewerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Next always supplies the request; the parameter is optional so the handler
    // stays callable bare, which is how the auth-guard test reaches the 401.
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

      // Half a coordinate, or a typo'd one, would fall through to the unfiltered
      // list — the exact leak this filter closes. So it's a 400, not a shrug.
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
        return NextResponse.json(
          { error: 'lat and lng must both be valid coordinates, and radiusKm positive' },
          { status: 400 }
        )
      }

      box = boundingBox(lat, lng, Math.min(radiusKm, MAX_RADIUS_KM))
    }

    // Hide anyone in a block relationship with the viewer (either direction).
    const blocks = await db.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    })
    const excludeIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))

    const users = await db.user.findMany({
      // Suspended accounts never appear in discovery — the other half of the
      // moderation action (the first is getSessionUser refusing their session).
      where: {
        suspendedAt: null,
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
        // Without a viewer position this endpoint shipped every visible user's
        // cell to anyone logged in. With one, the range predicate keeps the
        // payload to the neighbourhood asked for. Rows with no coordinates drop
        // out here, which is right — they can't be near anybody.
        ...(box
          ? {
              lat: { gte: box.minLat, lte: box.maxLat },
              ...(box.wrapsAntimeridian ? {} : { lng: { gte: box.minLng, lte: box.maxLng } }),
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_USERS,
      include: {
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
