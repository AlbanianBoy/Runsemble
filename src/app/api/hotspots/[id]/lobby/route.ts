import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { haversineKm } from '@/lib/geo'
import { awardXpAmount } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'

// ─── Run lobby ────────────────────────────────────────────────────────────────
// The pre-run gathering screen for a hotspot run. Participants check in
// ("I'm here", geofenced to the start point when GPS is available) and anyone
// checked in can start the run for everyone. Clients poll GET every few
// seconds; when lobbyStartedAt appears, their trackers start too.

const CHECKIN_XP = 25 // showing up is the whole point — reward it
const GEOFENCE_KM = 0.3 // ~300m around the start point (GPS jitter friendly)
const START_FRESH_MS = 2 * 60 * 60 * 1000 // a start older than 2h is a past run

async function loadLobby(hotspotId: string) {
  const hotspot = await db.hotspot.findUnique({
    where: { id: hotspotId },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, avatar: true, paceLevel: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
  if (!hotspot) return null

  // Only surface a *fresh* start — recurring official spots must not replay
  // yesterday's start signal to today's lobby.
  const fresh =
    hotspot.lobbyStartedAt && Date.now() - hotspot.lobbyStartedAt.getTime() < START_FRESH_MS
      ? hotspot.lobbyStartedAt
      : null

  return {
    hotspot: {
      id: hotspot.id,
      name: hotspot.name,
      location: hotspot.location,
      startTime: hotspot.startTime,
      lat: hotspot.lat,
      lng: hotspot.lng,
    },
    participants: hotspot.participants.map((p) => ({
      userId: p.userId,
      // "Here" decays like it does in the group lobby. Stored status alone made
      // a check-in permanent, so a lobby kept showing people as present hours
      // after the run — you'd turn up expecting a group that had long gone.
      // completed/cancelled are terminal and left alone.
      status:
        p.status === 'here' && !(p.checkedInAt && Date.now() - p.checkedInAt.getTime() < START_FRESH_MS)
          ? 'joined'
          : p.status,
      checkedInAt: p.checkedInAt,
      user: p.user,
    })),
    lobbyStartedAt: fresh,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lobby = await loadLobby(id)
    if (!lobby) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    return NextResponse.json(lobby)
  } catch (error) {
    console.error('Error loading lobby:', error)
    return NextResponse.json({ error: 'Failed to load lobby' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const { action, lat, lng } = await request.json()
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }

    const hotspot = await db.hotspot.findUnique({ where: { id } })
    if (!hotspot) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

    let xp: Awaited<ReturnType<typeof awardXpAmount>> = null

    if (action === 'checkin') {
      // Geofence when we know where the runner is. Without GPS we let them
      // check in anyway — production would require a verified fix.
      if (typeof lat === 'number' && typeof lng === 'number') {
        const distKm = haversineKm({ lat, lng }, { lat: hotspot.lat, lng: hotspot.lng })
        if (distKm > GEOFENCE_KM) {
          const m = Math.round(distKm * 1000)
          return NextResponse.json(
            { error: `You're ~${m} m from the start point — head there and check in again` },
            { status: 400 }
          )
        }
      }

      const existing = await db.hotspotParticipant.findUnique({
        where: { hotspotId_userId: { hotspotId: id, userId } },
      })
      const firstCheckin = !existing || existing.status !== 'here'

      // Not joined yet? Checking in joins you too — no needless friction.
      await db.hotspotParticipant.upsert({
        where: { hotspotId_userId: { hotspotId: id, userId } },
        create: { hotspotId: id, userId, status: 'here', checkedInAt: new Date() },
        update: { status: 'here', checkedInAt: new Date() },
      })

      if (firstCheckin) {
        xp = await awardXpAmount(userId, CHECKIN_XP).catch(() => null)
      }
    } else if (action === 'start') {
      const participant = await db.hotspotParticipant.findUnique({
        where: { hotspotId_userId: { hotspotId: id, userId } },
      })
      if (!participant || participant.status !== 'here') {
        return NextResponse.json({ error: 'Check in first, then start the run' }, { status: 400 })
      }

      const stale =
        !hotspot.lobbyStartedAt ||
        Date.now() - hotspot.lobbyStartedAt.getTime() >= START_FRESH_MS
      if (stale) {
        await db.hotspot.update({ where: { id }, data: { lobbyStartedAt: new Date() } })

        // Tell everyone else in the lobby the run just kicked off — after the
        // response, so a big lobby doesn't make the starter wait on N writes +
        // pushes before "start" returns.
        after(async () => {
          const starter = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
          const others = await db.hotspotParticipant.findMany({
            where: { hotspotId: id, userId: { not: userId }, status: { in: ['joined', 'here'] } },
          })
          await Promise.all(
            others.map((p) =>
              notify({
                userId: p.userId,
                actorId: userId,
                type: 'hotspot_join',
                title: `${starter?.name ?? 'Someone'} started ${hotspot.name}`,
                body: 'The group is off — open the run to join in!',
                entityId: id,
                icon: '🏃',
              })
            )
          )
        })
      }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const lobby = await loadLobby(id)
    return NextResponse.json({ lobby, xp })
  } catch (error) {
    console.error('Error updating lobby:', error)
    return NextResponse.json({ error: 'Failed to update lobby' }, { status: 500 })
  }
}
