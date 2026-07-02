import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { awardXp, grantBadge, BADGES } from '@/lib/xp'
import { notify } from '@/lib/notify'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    // Check hotspot exists
    const hotspot = await db.hotspot.findUnique({ where: { id } })
    if (!hotspot) {
      return NextResponse.json(
        { error: 'Hotspot not found' },
        { status: 404 }
      )
    }

    // Check if already a participant
    const existing = await db.hotspotParticipant.findUnique({
      where: {
        hotspotId_userId: { hotspotId: id, userId },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Already joined this hotspot' },
        { status: 409 }
      )
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
      xp = await awardXp(userId, 'joinHotspot')

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
      return NextResponse.json(
        { error: 'Failed to load updated hotspot' },
        { status: 500 }
      )
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
    return NextResponse.json(
      { error: 'Failed to join hotspot' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query param is required' },
        { status: 400 }
      )
    }

    const participant = await db.hotspotParticipant.findUnique({
      where: {
        hotspotId_userId: { hotspotId: id, userId },
      },
    })

    if (!participant) {
      return NextResponse.json(
        { error: 'Not a participant of this hotspot' },
        { status: 404 }
      )
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
      return NextResponse.json(
        { error: 'Failed to load updated hotspot' },
        { status: 500 }
      )
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
    return NextResponse.json(
      { error: 'Failed to leave hotspot' },
      { status: 500 }
    )
  }
}
