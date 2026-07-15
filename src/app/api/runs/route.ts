import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { awardXpAmount, grantBadge, computeStreak, BADGES, type BadgeSpec } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'

// List YOUR tracked runs (newest first). GPS traces are private — session only.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const runs = await db.runSession.findMany({
      where: { userId },
      include: {
        hotspot: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { endedAt: 'desc' },
      take: 30,
    })
    return NextResponse.json({ runs })
  } catch (error) {
    console.error('Error fetching runs:', error)
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 })
  }
}

// Save a completed run. This is the heart of the gamification loop: it records
// the session, moves the user's real stats (distance, duration, streak, runs),
// awards distance-scaled XP, unlocks badges, and optionally shares to the feed.
export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const body = await request.json()
    const {
      clientRunId = null,
      distanceKm = 0,
      durationSec = 0,
      hotspotId = null,
      groupId = null,
      sportType = 'running',
      companions = 0,
      buddyIds = [],
      path = null,
      splits = null,
      note = null,
      shareToFeed = false,
      rating = null,
    } = body

    // Idempotency for offline sync: a run saved offline is re-POSTed when signal
    // returns, possibly more than once. If we've already recorded this exact run
    // (matched by the client-generated id), return it without re-running any of
    // the side effects below (XP, streak, badges, buddies, feed post). Without
    // this a reconnect could award XP twice and post duplicate runs to the feed.
    const cid = typeof clientRunId === 'string' && clientRunId.length > 0 ? clientRunId : null
    if (cid) {
      const existing = await db.runSession.findUnique({ where: { clientRunId: cid } })
      if (existing) {
        if (existing.userId !== userId) {
          return NextResponse.json({ error: 'Run belongs to another account' }, { status: 409 })
        }
        return NextResponse.json({ session: existing, duplicate: true }, { status: 200 })
      }
    }

    // Session already resolved the full user row — no extra lookup needed.
    const user = me

    // ── Plausibility bounds (anti-cheat / leaderboard integrity) ─────────────
    // Cap distance and duration to physically possible values before any maths.
    const rawDist = Math.max(0, Number(distanceKm) || 0)
    const rawDur  = Math.max(0, Math.round(Number(durationSec) || 0))
    const dist = Math.min(rawDist, 200)   // max 200 km per session
    const dur  = Math.min(rawDur,  86400) // max 24 h per session

    // Pace sanity: must be between 2 min/km (elite sprint) and 30 min/km (slow walk).
    // Only checked when both distance and duration are non-zero.
    if (dist > 0 && dur > 0) {
      const paceSecPerKm = dur / dist
      if (paceSecPerKm < 120 || paceSecPerKm > 1800) {
        return NextResponse.json({ error: 'Invalid run data: pace out of realistic range' }, { status: 422 })
      }
    }

    const avgPaceSecPerKm = dist > 0 ? Math.round(dur / dist) : 0
    // Rough calorie estimate: ~60 kcal per km (bodyweight-agnostic demo value).
    const calories = Math.round(dist * 60)
    const untaggedCompanions = Math.max(0, Math.round(Number(companions) || 0))

    // ── Run buddies (the "met someone new" loop) ──
    // Tagged people you actually ran with become buddies. New buddies are the
    // real relationship-building moment, so they earn the bigger reward.
    const taggedIds: string[] = Array.isArray(buddyIds)
      ? [...new Set(buddyIds.filter((b: unknown) => typeof b === 'string' && b !== userId))] as string[]
      : []

    let newBuddyCount = 0
    const newBuddyNames: string[] = []
    for (const otherId of taggedIds) {
      const other = await db.user.findUnique({ where: { id: otherId }, select: { id: true, name: true } })
      if (!other) continue
      const existing = await db.buddy.findUnique({
        where: { userId_buddyId: { userId, buddyId: otherId } },
      })
      if (!existing) {
        // Directional rows so both people see each other as buddies.
        await db.buddy.createMany({
          data: [
            { userId, buddyId: otherId },
            { userId: otherId, buddyId: userId },
          ],
        })
        newBuddyCount++
        newBuddyNames.push(other.name)
        await notify({
          userId: otherId,
          actorId: userId,
          type: 'run_invite',
          title: `${user.name} ran with you 🏃`,
          body: "You're now run buddies. Book your next run together!",
          entityId: userId,
          icon: '🤝',
        })
      }
    }

    const companionCount = untaggedCompanions + taggedIds.length

    // XP: showing up (20) + effort (10/km) + a new buddy (30 each, the real value)
    // + other companions (15 each).
    const xpEarned =
      20 + Math.round(dist * 10) + newBuddyCount * 30 + untaggedCompanions * 15

    // ── Streak ──
    const streakRes = computeStreak(user.lastActiveDate, user.streak, user.longestStreak)

    let session
    try {
      session = await db.runSession.create({
        data: {
          userId,
          clientRunId: cid,
          hotspotId,
          groupId,
          sportType,
          distanceKm: dist,
          durationSec: dur,
          avgPaceSecPerKm,
          calories,
          companions: companionCount,
          path: path ? JSON.stringify(path).slice(0, 100_000) : null,
          splits: Array.isArray(splits) && splits.length ? JSON.stringify(splits).slice(0, 10_000) : null,
          note,
          xpEarned,
          endedAt: new Date(),
        },
      })
    } catch (e) {
      // A concurrent duplicate (two reconnect retries racing) trips the
      // clientRunId unique constraint. Treat it as the idempotent case: return
      // the row the winning request created rather than erroring.
      if (cid && e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
        const existing = await db.runSession.findUnique({ where: { clientRunId: cid } })
        if (existing) return NextResponse.json({ session: existing, duplicate: true }, { status: 200 })
      }
      throw e
    }

    const newTotalDistance = user.totalDistanceKm + dist

    await db.user.update({
      where: { id: userId },
      data: {
        totalRuns: { increment: 1 },
        totalDistanceKm: newTotalDistance,
        totalDurationSec: { increment: dur },
        totalPeopleRunWith: { increment: newBuddyCount + untaggedCompanions },
        streak: streakRes.streak,
        longestStreak: streakRes.longestStreak,
        lastActiveDate: streakRes.lastActiveDate,
      },
    })

    // Close the loop on the hotspot: this participant actually ran.
    if (hotspotId) {
      await db.hotspotParticipant
        .updateMany({ where: { hotspotId, userId }, data: { status: 'completed' } })
        .catch(() => {})
    }

    // ── Rating (post-run, for hotspot runs) ──
    if (hotspotId && rating && Number(rating) >= 1) {
      await db.runRating.create({
        data: { hotspotId, userId, rating: Math.min(5, Math.round(Number(rating))), comment: note ?? null },
      }).catch(() => {}) // best-effort; upsert-style via @@unique constraint
    }

    // XP is awarded on top of the base user.update so rank-up detection is clean.
    const xp = await awardXpAmount(userId, xpEarned, 'streakDay')

    // ── Badges ──
    const badgesEarned: BadgeSpec[] = []
    const grant = async (spec: BadgeSpec) => {
      const got = await grantBadge(userId, spec)
      if (got) badgesEarned.push(got)
    }

    const runCount = await db.runSession.count({ where: { userId } })
    if (runCount === 1) await grant(BADGES.firstTrack)
    if (newTotalDistance >= 10 && user.totalDistanceKm < 10) await grant(BADGES.distance10)
    if (newTotalDistance >= 50 && user.totalDistanceKm < 50) await grant(BADGES.distance50)
    if (newTotalDistance >= 100 && user.totalDistanceKm < 100) await grant(BADGES.distance100)
    if (streakRes.streak >= 7) await grant(BADGES.streak7)
    if (streakRes.streak >= 30) await grant(BADGES.streak30)

    // Self-notification for the activity log.
    await notify({
      userId,
      type: 'run_complete',
      title: `You ran ${dist.toFixed(2)} km`,
      body: `+${xpEarned} XP${badgesEarned.length ? ` · ${badgesEarned.length} badge${badgesEarned.length > 1 ? 's' : ''}` : ''}`,
      entityId: session.id,
      icon: '🏃',
    })

    // Optional feed post so runs can be celebrated socially.
    if (shareToFeed) {
      const mins = Math.floor(dur / 60)
      const withPart =
        newBuddyNames.length > 0
          ? ` with ${newBuddyNames.slice(0, 2).join(' & ')}${newBuddyNames.length > 2 ? ` +${newBuddyNames.length - 2}` : ''}`
          : companionCount > 0
          ? ` with ${companionCount} other${companionCount > 1 ? 's' : ''}`
          : ''
      await db.feedPost.create({
        data: {
          authorId: userId,
          groupId: groupId ?? null,
          postType: 'milestone',
          runSessionId: session.id,
          content:
            note?.trim() ||
            `Just tracked a ${dist.toFixed(2)} km run in ${mins} min${withPart}! 🏃`,
        },
      })
    }

    return NextResponse.json(
      { session, xp, badgesEarned, streak: streakRes, newBuddyCount },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error saving run:', error)
    return NextResponse.json({ error: 'Failed to save run' }, { status: 500 })
  }
}
