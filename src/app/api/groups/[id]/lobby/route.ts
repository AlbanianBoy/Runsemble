import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { awardXpAmount } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { blockedUserIds } from '@/lib/blocks'
import { getSessionUser } from '@/lib/auth'
import { apiError, readJson } from '@/lib/http'

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

async function loadLobby(groupId: string, viewerId?: string | null) {
  const group = await db.runGroup.findUnique({
    where: { id: groupId },
    include: {
      members: {
        // Blocking has to hold where you'd actually stand next to someone, not
        // just on the map and in DMs.
        where: viewerId ? { userId: { notIn: await blockedUserIds(viewerId) } } : undefined,
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

    // Private groups are visible to members only.
    const group = await db.runGroup.findUnique({ where: { id }, select: { isPublic: true } })
    if (!group) return apiError(404, 'not_found', 'Group not found')
    if (!group.isPublic) {
      const me = await getSessionUser()
      const member = me
        ? await db.groupMember.findUnique({ where: { groupId_userId: { groupId: id, userId: me.id } } })
        : null
      if (!member) return apiError(403, 'forbidden', 'This group is private')
    }

    const lobby = await loadLobby(id, (await getSessionUser())?.id ?? null)
    if (!lobby) return apiError(404, 'not_found', 'Group not found')
    return NextResponse.json(lobby)
  } catch (error) {
    console.error('Error loading group lobby:', error)
    return apiError(500, 'internal', 'Failed to load lobby')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const { action } = parsed.body
    if (!action) return apiError(400, 'missing_field', 'action is required')

    const group = await db.runGroup.findUnique({ where: { id } })
    if (!group) return apiError(404, 'not_found', 'Group not found')

    const member = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId: me.id } },
    })
    if (!member) return apiError(403, 'forbidden', 'Join the group first')

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
        return apiError(400, 'precondition_failed', 'Check in first, then start the run')
      }
      const stale = !group.lobbyStartedAt || !isFresh(group.lobbyStartedAt)
      if (stale) {
        await db.runGroup.update({ where: { id }, data: { lobbyStartedAt: new Date() } })
        // Fan-out after the response so "start" returns immediately.
        after(async () => {
          const others = await db.groupMember.findMany({
            where: { groupId: id, userId: { not: me.id } },
          })
          await Promise.all(
            others.map((m) =>
              notify({
                userId: m.userId,
                actorId: me.id,
                type: 'group_run_started',
                title: `${me.name} started a ${group.name} run`,
                body: 'The group is off — open the run to join in!',
                entityId: id,
                icon: '🏃',
              })
            )
          )
        })
      }
    } else {
      return apiError(400, 'invalid_value', 'Unknown action')
    }

    const lobby = await loadLobby(id, me.id)
    return NextResponse.json({ lobby, xp })
  } catch (error) {
    console.error('Error updating group lobby:', error)
    return apiError(500, 'internal', 'Failed to update lobby')
  }
}
