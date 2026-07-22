import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { awardXp, grantBadge, BADGES } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { canJoinAudience } from '@/lib/enums'
import { apiError } from '@/lib/http'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    // Check hotspot exists
    const hotspot = await db.hotspot.findUnique({ where: { id } })
    if (!hotspot) {
      return apiError(404, 'not_found', 'Hotspot not found')
    }

    // Enforce a restricted audience server-side. The women-only badge was
    // advertised but never checked — anyone could join. Now the join is refused
    // unless the runner is eligible.
    if (!canJoinAudience(me.gender, hotspot.audience)) {
      return apiError(403, 'forbidden', 'This run is for women only.')
    }

    // Check if already a participant
    const existing = await db.hotspotParticipant.findUnique({
      where: {
        hotspotId_userId: { hotspotId: id, userId },
      },
    })

    if (existing) {
      // 'conflict' is what onboarding (and join buttons) should branch on —
      // not string-matching "already" in the human sentence.
      return apiError(409, 'conflict', 'Already joined this hotspot')
    }

    await db.hotspotParticipant.create({
      data: {
        hotspotId: id,
        userId,
        status: 'joined',
      },
    })

    // ── Gamification: reward participation ──────────────────────────────────
    // Joining a run grants XP and may unlock badges. Faithful to the concept's
    // "rewards showing up" principle. Awards are best-effort — a failure here
    // must never block the join itself.
    let xp: Awaited<ReturnType<typeof awardXp>> = null
    let badgeEarned: Awaited<ReturnType<typeof grantBadge>> = null
    try {
      // Join XP is paid for INTENT, not a completed run, so it needs bounding on
      // two axes:
      //   - not your own hotspot ("create one, join it" was a free 50 XP loop)
      //   - once per day, so leave/rejoin (here or across hotspots) can't be
      //     farmed. The row we just created counts, hence <= 1.
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const joinsToday = await db.hotspotParticipant.count({
        where: { userId, joinedAt: { gte: startOfDay } },
      })
      if (hotspot.createdBy !== userId && joinsToday <= 1) {
        xp = await awardXp(userId, 'joinHotspot')
      }

      const joinedCount = await db.hotspotParticipant.count({ where: { userId } })
      if (joinedCount === 1) {
        badgeEarned = await grantBadge(userId, BADGES.firstRun)
      } else if (joinedCount === 5) {
        badgeEarned = await grantBadge(userId, BADGES.social5)
      }

      // Notify the run's creator that someone joined.
      if (hotspot.createdBy && hotspot.createdBy !== userId) {
        const joiner = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
        await notify({
          userId: hotspot.createdBy,
          actorId: userId,
          type: 'hotspot_join',
          title: `${joiner?.name ?? 'Someone'} joined your run`,
          body: hotspot.name,
          entityId: id,
          icon: '🔥',
        })
      }
      // Log rank-ups and badges to the recipient's own inbox.
      if (xp?.rankedUp) {
        await notify({
          userId,
          type: 'rank_up',
          title: `You reached ${xp.rankAfter}!`,
          body: 'Keep showing up to climb the ranks.',
          icon: '🏅',
        })
      }
      if (badgeEarned) {
        await notify({
          userId,
          type: 'badge',
          title: `Badge unlocked: ${badgeEarned.title}`,
          body: badgeEarned.description,
          icon: badgeEarned.icon,
        })
      }
    } catch (e) {
      console.error('XP award failed (non-fatal):', e)
    }

    // Return updated hotspot with participants
    const updatedHotspot = await db.hotspot.findUnique({
      where: { id },
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
          orderBy: { joinedAt: 'asc' },
        },
      },
    })

    if (!updatedHotspot) {
      return apiError(500, 'internal', 'Failed to load updated hotspot')
    }

    const now = new Date()
    const msUntil = updatedHotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    return NextResponse.json({
      hotspot: {
        ...updatedHotspot,
        participantCount: updatedHotspot.participants.length,
        participantNames: updatedHotspot.participants.map((p) => p.user.name),
        minutesUntil,
      },
      xp,
      badgeEarned,
    })
  } catch (error) {
    console.error('Error joining hotspot:', error)
    return apiError(500, 'internal', 'Failed to join hotspot')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    const participant = await db.hotspotParticipant.findUnique({
      where: {
        hotspotId_userId: { hotspotId: id, userId },
      },
    })

    if (!participant) {
      return apiError(404, 'not_found', 'Not a participant of this hotspot')
    }

    await db.hotspotParticipant.delete({
      where: {
        hotspotId_userId: { hotspotId: id, userId },
      },
    })

    const updatedHotspot = await db.hotspot.findUnique({
      where: { id },
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
          orderBy: { joinedAt: 'asc' },
        },
      },
    })

    if (!updatedHotspot) {
      return apiError(500, 'internal', 'Failed to load updated hotspot')
    }

    const now = new Date()
    const msUntil = updatedHotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    return NextResponse.json({
      hotspot: {
        ...updatedHotspot,
        participantCount: updatedHotspot.participants.length,
        participantNames: updatedHotspot.participants.map((p) => p.user.name),
        minutesUntil,
      },
    })
  } catch (error) {
    console.error('Error leaving hotspot:', error)
    return apiError(500, 'internal', 'Failed to leave hotspot')
  }
}
