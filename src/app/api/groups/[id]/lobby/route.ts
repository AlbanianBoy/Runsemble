import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { awardXpAmount } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'

// ─── Group run lobby ──────────────────────────────────────────────────────────
// Start-together for RunGroups, mirroring the hotspot lobby contract so the
// client component works for both. Groups have no fixed start point, so
// presence is a freshness window on GroupMember.checkedInAt (last 2h counts
// as "here") instead of a geofence, and members-only (no auto-join).

const CHECKIN_XP = 25
const FRESH_MS = 2 * 60 * 60 * 1000

function isFresh(d: Date | null): boolean {
  return !!d && Date.now() - d.getTime() < FRESH_MS
}

async function loadLobby(groupId: string) {
  const group = await db.runGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, avatar: true, paceLevel: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
  if (!group) return null

  const participants = group.members
    .map((m) => ({
      userId: m.userId,
      status: isFresh(m.checkedInAt) ? 'here' : 'joined',
      checkedInAt: m.checkedInAt,
      user: m.user,
    }))
    // "Here" first — group member lists can be long.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'here' ? -1 : 1))

  return {
    // Same field name as the hotspot lobby so the client stays generic.
    hotspot: { id: group.id, name: group.name, location: group.city, startTime: null, lat: null, lng: null },
    participants,
    lobbyStartedAt: group.lobbyStartedAt && isFresh(group.lobbyStartedAt) ? group.lobbyStartedAt : null,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lobby = await loadLobby(id)
    if (!lobby) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    return NextResponse.json(lobby)
  } catch (error) {
    console.error('Error loading group lobby:', error)
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

    const { action } = await request.json()
    if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const member = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!member) return NextResponse.json({ error: 'Join the group first' }, { status: 403 })

    let xp: Awaited<ReturnType<typeof awardXpAmount>> = null

    if (action === 'checkin') {
      const firstCheckin = !isFresh(member.checkedInAt)
      await db.groupMember.update({
        where: { groupId_userId: { groupId: id, userId: me.id } },
        data: { checkedInAt: new Date() },
      })
      if (firstCheckin) {
        xp = await awardXpAmount(me.id, CHECKIN_XP).catch(() => null)
      }
    } else if (action === 'start') {
      if (!isFresh(member.checkedInAt)) {
        return NextResponse.json({ error: 'Check in first, then start the run' }, { status: 400 })
      }
      const stale = !group.lobbyStartedAt || !isFresh(group.lobbyStartedAt)
      if (stale) {
        await db.runGroup.update({ where: { id }, data: { lobbyStartedAt: new Date() } })
        const others = await db.groupMember.findMany({
          where: { groupId: id, userId: { not: me.id } },
        })
        await Promise.all(
          others.map((m) =>
            notify({
              userId: m.userId,
              actorId: me.id,
              type: 'hotspot_join',
              title: `${me.name} started a ${group.name} run`,
              body: 'The group is off — open the run to join in!',
              entityId: id,
              icon: '🏃',
            })
          )
        )
      }
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const lobby = await loadLobby(id)
    return NextResponse.json({ lobby, xp })
  } catch (error) {
    console.error('Error updating group lobby:', error)
    return NextResponse.json({ error: 'Failed to update lobby' }, { status: 500 })
  }
}
