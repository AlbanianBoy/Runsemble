import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { describeXpAward, grantBadge, computeStreak, BADGES, type BadgeSpec } from '@/lib/xp'
import { notify } from '@/lib/notify'
import { eligibleBuddyIds } from '@/lib/buddies'
import { getSessionUser } from '@/lib/auth'
import { SPORT_TYPES, validateEnumFields, isOneOf } from '@/lib/enums'
import { verifyRunDistance } from '@/lib/run-math'
import { apiError, readJson } from '@/lib/http'

// Anti-abuse caps on client-declared social inputs. A run's distance is already
// verified against its GPS evidence; these bound the parts that aren't — how
// many people you say you ran with — so the XP economy can't be farmed from one
// request. Generous enough that a real group run is never clipped.
const MAX_COMPANIONS = 20
const MAX_TAGGED_BUDDIES = 20
// How many people a single run pays social XP for. Beyond this you can still tag
// everyone you ran with — it just stops being worth farming.
const XP_PAID_PEOPLE = 3
// A pure backstop set ABOVE the legitimate maximum (a GPS-verified 200km run at
// 10 XP/km plus 20 buddies and 20 companions tops out ~2920), so it never clips
// a real ultra — it only trips if a future change reintroduces an unbounded term.
const MAX_RUN_XP = 3200

// List YOUR tracked runs (newest first). GPS traces are private — session only.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
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
    return apiError(500, 'internal', 'Failed to fetch runs')
  }
}

// Save a completed run. This is the heart of the gamification loop: it records
// the session, moves the user's real stats (distance, duration, streak, runs),
// awards distance-scaled XP, unlocks badges, and optionally shares to the feed.
//
// Deliberately NOT rate-limited, unlike the other write routes. A save is
// idempotent on clientRunId, the distance is checked against its GPS evidence,
// and XP is capped per run and per day — so the abuse a limiter would stop is
// already stopped. What a limiter would break is real: a device that lost signal
// on a trail flushes its queued runs in one burst when it reconnects, and
// refusing those loses runs people actually did.
export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body

    const invalidEnum = validateEnumFields(body, { sportType: SPORT_TYPES })
    if (invalidEnum) return apiError(400, 'invalid_value', invalidEnum)

    // Narrowed here rather than trusted. These arrive from a device and every
    // one of them lands in a database column with a type; passing them through
    // as `any` meant the first check they met was Prisma's, which reports a bad
    // string as a 500 rather than a 400.
    const clientRunId = typeof body.clientRunId === 'string' ? body.clientRunId : null
    const distanceKm = Number(body.distanceKm) || 0
    const durationSec = Number(body.durationSec) || 0
    const hotspotId = typeof body.hotspotId === 'string' ? body.hotspotId : null
    const groupId = typeof body.groupId === 'string' ? body.groupId : null
    const sportType = isOneOf(SPORT_TYPES, body.sportType) ? body.sportType : 'running'
    const companions = Number(body.companions) || 0
    const buddyIds = body.buddyIds
    const path = body.path
    const splits = body.splits
    const note = typeof body.note === 'string' ? body.note : null
    const shareToFeed = body.shareToFeed === true
    const rating = Number(body.rating) || 0

    // Idempotency for offline sync: a run saved offline is re-POSTed when signal
    // returns, possibly more than once. If we've already recorded this exact run
    // (matched by the client-generated id), return it without re-running any of
    // the side effects below (XP, streak, badges, buddies, feed post). Without
    // this a reconnect could award XP twice and post duplicate runs to the feed.
    const cid = typeof clientRunId === 'string' && clientRunId.length > 0 ? clientRunId : null
    if (cid) {
      // Scoped to this user: the id is generated on the device, so it is only
      // meaningful within one account. It used to be a global unique, which
      // meant another user's colliding id would surface here and get rejected
      // as "belongs to another account" — their run, refused, for no reason.
      const existing = await db.runSession.findUnique({
        where: { userId_clientRunId: { userId, clientRunId: cid } },
      })
      if (existing) {
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
        return apiError(422, 'unprocessable', 'Invalid run data: pace out of realistic range')
      }
    }

    // The pace/total checks only prove a claim is internally consistent — they
    // still trust the distance itself, so a request with no GPS can bank a full
    // run's XP at a believable pace. This checks the claim against its evidence:
    // the submitted route must be able to support the distance. Generous by
    // design (the client thins the path 3:1, so it under-counts) — see run-math.
    const verdict = verifyRunDistance(dist, path)
    if (!verdict.ok) {
      return apiError(422, 'unprocessable', verdict.reason)
    }

    const avgPaceSecPerKm = dist > 0 ? Math.round(dur / dist) : 0
    // Rough calorie estimate: ~60 kcal per km (bodyweight-agnostic demo value).
    const calories = Math.round(dist * 60)
    // Companions and buddy tags are client-declared, so they're untrusted the
    // same way distance is. Uncapped, `companions: 99999` mints ~1.5M XP from a
    // single request and tops every board — clamp both to a sane per-run max.
    const untaggedCompanions = Math.min(MAX_COMPANIONS, Math.max(0, Math.round(Number(companions) || 0)))

    // ── Run buddies (the "met someone new" loop) ──
    // Tagged people you actually ran with become buddies. New buddies are the
    // real relationship-building moment, so they earn the bigger reward.
    const claimedIds: string[] = (
      Array.isArray(buddyIds)
        ? [...new Set(buddyIds.filter((b: unknown) => typeof b === 'string' && b !== userId))] as string[]
        : []
    ).slice(0, MAX_TAGGED_BUDDIES)

    // A tag writes a row on someone else's profile and pushes them a
    // notification, so it needs evidence you actually ran together — see
    // eligibleBuddyIds. Ineligible ids are dropped, not rejected: the run
    // already happened and may be arriving from an offline queue, and losing
    // real data to enforce a social rule would be the wrong trade.
    const { allowed: taggedIds, rejected: rejectedBuddyIds } = await eligibleBuddyIds(
      userId,
      claimedIds,
      { hotspotId, groupId }
    )

    // Work out who is new, without writing anything yet. The buddy rows are
    // created inside the transaction below alongside the run, and the "you ran
    // together" notifications are sent only once that has actually committed —
    // telling someone they have a new run buddy and then rolling the run back
    // would be a message about an event that never happened.
    const newBuddies: { id: string; name: string }[] = []
    for (const otherId of taggedIds) {
      const other = await db.user.findUnique({ where: { id: otherId }, select: { id: true, name: true } })
      if (!other) continue
      const existing = await db.buddy.findUnique({
        where: { userId_buddyId: { userId, buddyId: otherId } },
      })
      if (!existing) newBuddies.push(other)
    }
    const newBuddyCount = newBuddies.length
    const newBuddyNames = newBuddies.map((b) => b.name)

    const companionCount = untaggedCompanions + taggedIds.length

    // XP: showing up (20) + effort (10/km) + running with people.
    //
    // The social part is paid on the FIRST few people only, not linearly per
    // head. Linear per-person XP made "collect as many people as possible" the
    // optimal play — which is what turned buddy-tagging into something you do TO
    // someone rather than with them. A group run still pays more than a solo one;
    // tagging twenty strangers pays the same as running with three friends.
    const paidBuddies = Math.min(newBuddyCount, XP_PAID_PEOPLE)
    const paidCompanions = Math.min(untaggedCompanions, XP_PAID_PEOPLE)
    const xpEarned = Math.min(
      MAX_RUN_XP,
      20 + Math.round(dist * 10) + paidBuddies * 30 + paidCompanions * 15
    )

    // ── Streak ──
    const streakRes = computeStreak(user.lastActiveDate, user.streak, user.longestStreak)

    const newTotalDistance = user.totalDistanceKm + dist

    // ── The part that must be all-or-nothing ──
    // A run and the totals it moves are one fact about the user. Written
    // separately, a failure between them leaves the account permanently wrong:
    // a run in the history worth no XP, or XP for a run that isn't there, and
    // nothing later recomputes either. Everything below this block is a
    // decoration that can be retried or lost without corrupting the record.
    let session
    try {
      session = await db.$transaction(async (tx) => {
        // Directional rows so both people see each other as buddies.
        // skipDuplicates covers the gap between the read above and this write.
        if (newBuddies.length > 0) {
          await tx.buddy.createMany({
            data: newBuddies.flatMap((b) => [
              { userId, buddyId: b.id },
              { userId: b.id, buddyId: userId },
            ]),
            skipDuplicates: true,
          })
        }

        const created = await tx.runSession.create({
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

        await tx.user.update({
          where: { id: userId },
          data: {
            totalRuns: { increment: 1 },
            totalDistanceKm: newTotalDistance,
            totalDurationSec: { increment: dur },
            totalPeopleRunWith: { increment: newBuddyCount + untaggedCompanions },
            streak: streakRes.streak,
            longestStreak: streakRes.longestStreak,
            lastActiveDate: streakRes.lastActiveDate,
            // Folded in here rather than a separate awardXpAmount call: it keeps
            // the XP inside this transaction, and an atomic increment can't lose
            // an award to a run finishing at the same instant.
            xp: { increment: xpEarned },
          },
        })

        return created
      })
    } catch (e) {
      // A concurrent duplicate (two reconnect retries racing) trips the
      // clientRunId unique constraint. Treat it as the idempotent case: return
      // the row the winning request created rather than erroring.
      if (cid && e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
        const existing = await db.runSession.findUnique({
          where: { userId_clientRunId: { userId, clientRunId: cid } },
        })
        if (existing) return NextResponse.json({ session: existing, duplicate: true }, { status: 200 })
      }
      throw e
    }

    // ── Everything from here on is best-effort ──
    // The run is safely recorded. These steps can each fail without making the
    // account wrong, so none of them is allowed to fail the request.

    // Now that the run has committed, tell the people tagged in it.
    for (const b of newBuddies) {
      await notify({
        userId: b.id,
        actorId: userId,
        type: 'run_invite',
        title: `${user.name} ran with you 🏃`,
        body: "You're now run buddies. Book your next run together!",
        entityId: userId,
        icon: '🤝',
      })
    }

    // Close the loop on the hotspot: this participant actually ran.
    if (hotspotId) {
      await db.hotspotParticipant
        .updateMany({ where: { hotspotId, userId }, data: { status: 'completed' } })
        .catch(() => {})
    }

    // ── Rating (post-run, for hotspot runs) ──
    if (hotspotId && rating >= 1) {
      await db.runRating.create({
        data: { hotspotId, userId, rating: Math.min(5, Math.round(rating)), comment: note },
      }).catch(() => {}) // best-effort; upsert-style via @@unique constraint
    }

    // The XP itself already moved inside the transaction; this just describes
    // the award (and any rank-up) for the client to celebrate.
    const xp = describeXpAward(user.xp, xpEarned, 'streakDay')

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
          // Only a run that actually unlocked something is a milestone. Every
          // shared run used to carry the badge, which made it mean nothing —
          // an ordinary Tuesday 5k is a moment, not an achievement.
          postType: badgesEarned.length > 0 ? 'milestone' : 'moment',
          runSessionId: session.id,
          content:
            note?.trim() ||
            `Just tracked a ${dist.toFixed(2)} km run in ${mins} min${withPart}! 🏃`,
        },
      })
    }

    return NextResponse.json(
      { session, xp, badgesEarned, streak: streakRes, newBuddyCount, rejectedBuddyCount: rejectedBuddyIds.length },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error saving run:', error)
    return apiError(500, 'internal', 'Failed to save run')
  }
}
