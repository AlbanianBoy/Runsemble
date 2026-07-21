import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { haversineKm } from '@/lib/geo'
import { awardXpAmount } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { blockedUserIds } from '@/lib/blocks'
import { getSessionUser } from '@/lib/auth'

// ─── Run lobby ────────────────────────────────────────────────────────────────
// The pre-run gathering screen for a hotspot run. Participants check in
// ("I'm here", geofenced to the start point when GPS is available) and anyone
// checked in can start the run for everyone. Clients poll GET every few
// seconds; when lobbyStartedAt appears, their trackers start too.

const CHECKIN_XP = 25 // showing up is the whole point — reward it
const GEOFENCE_KM = 0.3 // ~300m around the start point (GPS jitter friendly)
const START_FRESH_MS = 2 * 60 * 60 * 1000 // a start older than 2h is a past run
// How early anyone present may call the start if the host hasn't. Groups gather
// a few minutes before the hour; a no-show host shouldn't strand them.
const START_GRACE_MS = 10 * 60 * 1000

async function loadLobby(hotspotId: string, viewerId?: string | null) {
  const hotspot = await db.hotspot.findUnique({
    where: { id: hotspotId },
    include: {
      participants: {
        // Someone you've blocked (or who blocked you) shouldn't appear in a
        // lobby you're standing in. Blocking held on the map and in DMs but not
        // here, which is the one place you'd actually be next to them.
        where: viewerId ? { userId: { notIn: await blockedUserIds(viewerId) } } : undefined,
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
    const lobby = await loadLobby(id, (await getSessionUser())?.id ?? null)
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

      // Checking in still joins you — the lobby has no separate join button, and
      // turning up IS the commitment. The risk this used to carry (a passer-by
      // auto-joining and immediately broadcasting "we've started" to someone
      // else's run) is handled on the 'start' action below instead.
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

      // "Start" pushes a notification to everyone in the lobby, so it needs an
      // owner. Being merely present isn't enough: check-in auto-joins, so anyone
      // passing the start point could otherwise announce that a stranger's run
      // had begun. The host calls it — or anyone present once the run is
      // actually due, so a no-show host can't strand the group.
      const dueAt = hotspot.startTime.getTime() - START_GRACE_MS
      const isHost = !hotspot.createdBy || hotspot.createdBy === userId
      if (!isHost && Date.now() < dueAt) {
        return NextResponse.json(
          { error: 'Only the person who created this run can start it before its start time' },
          { status: 403 }
        )
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

    const lobby = await loadLobby(id, userId)
    return NextResponse.json({ lobby, xp })
  } catch (error) {
    console.error('Error updating lobby:', error)
    return NextResponse.json({ error: 'Failed to update lobby' }, { status: 500 })
  }
}
