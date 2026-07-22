import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { apiError } from '@/lib/http'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Same reasoning as the board: this hands back who is going, where, and when.
    if (!(await getSessionUser())) {
      return apiError(401, 'unauthenticated', 'Please log in')
    }

    const { id } = await params

    const hotspot = await db.hotspot.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                bio: true,
                paceLevel: true,
                preferredSport: true,
                totalRuns: true,
                streak: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        ratings: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!hotspot) {
      return apiError(404, 'not_found', 'Hotspot not found')
    }

    const now = new Date()
    const msUntil = hotspot.startTime.getTime() - now.getTime()
    const minutesUntil = Math.max(0, Math.round(msUntil / 60000))

    // Who organised this. createdBy is a bare id with no relation, so it needs a
    // lookup — but a stranger meetup with no visible host is exactly the thing
    // that should make someone hesitate, and the profile it links to is where
    // reporting and blocking live. Null for official/system runs, which have no
    // individual behind them.
    const host = hotspot.createdBy
      ? await db.user.findUnique({
          where: { id: hotspot.createdBy },
          select: { id: true, name: true, avatar: true, paceLevel: true },
        })
      : null

    const result = {
      ...hotspot,
      host,
      participantCount: hotspot.participants.length,
      participantNames: hotspot.participants.map((p) => p.user.name),
      minutesUntil,
    }

    return NextResponse.json({ hotspot: result })
  } catch (error) {
    console.error('Error fetching hotspot:', error)
    return apiError(500, 'internal', 'Failed to fetch hotspot')
  }
}

// Cancel a run you created. Soft: isActive=false takes it off the board (the
// list query already filters on it) while keeping the row, its participants and
// its history intact — a hard delete would erase the record of a meetup that
// people had arranged their evening around.
//
// Organiser-only. Everyone who joined gets told, because a run vanishing from
// the board without a word is how someone ends up standing at a park alone.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const hotspot = await db.hotspot.findUnique({ where: { id } })
    if (!hotspot) return apiError(404, 'not_found', 'Run not found')

    // Official/recurring runs have no individual owner and aren't one person's
    // to call off.
    if (!hotspot.createdBy || hotspot.createdBy !== me.id) {
      return apiError(403, 'forbidden', 'Only the person who created this run can cancel it')
    }

    await db.hotspot.update({ where: { id }, data: { isActive: false } })

    after(async () => {
      const others = await db.hotspotParticipant.findMany({
        where: { hotspotId: id, userId: { not: me.id } },
        select: { userId: true },
      })
      await Promise.all(
        others.map((p) =>
          notify({
            userId: p.userId,
            actorId: me.id,
            type: 'hotspot_join',
            title: `${hotspot.name} was cancelled`,
            body: `${me.name} called off this run — don't head out for it.`,
            entityId: id,
            icon: '🚫',
          })
        )
      )
    })

    return NextResponse.json({ ok: true, cancelled: true })
  } catch (error) {
    console.error('Error cancelling hotspot:', error)
    return apiError(500, 'internal', 'Failed to cancel the run')
  }
}
