import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

// Leaderboard, rankable by different metrics. Participation-first by design —
// the default board is XP (which rewards showing up), not raw speed.
const METRICS = {
  xp: 'xp',
  buddies: 'totalPeopleRunWith',
  streak: 'streak',
  runs: 'totalRuns',
  distance: 'totalDistanceKm',
} as const

type Metric = keyof typeof METRICS

// Rolling windows, not calendar ones. A calendar week empties every board at
// midnight on Monday, so for the first day the top spot belongs to whoever got
// out of bed first; a rolling window always covers a full seven days of running
// and has no dead zone to game.
const WINDOW_DAYS = { week: 7, month: 30 } as const
type TimeWindow = 'all' | keyof typeof WINDOW_DAYS

// The metrics that can honestly be recomputed from RunSession rows inside a
// window — and, by omission, the two that cannot.
//
// `streak` is a property of an unbroken chain of days, so "streak this week" is
// just min(streak, 7) for everyone who showed up: a seven-way tie, not a board.
// `buddies` is a lifetime head count on User; RunSession only records how MANY
// companions a run had, not who they were, so summing it counts the same friend
// once per shared run and would rank a pair of regulars above a real connector.
// Quietly serving the all-time board under a "Week" tab is the dishonest option,
// so windowed views drop both metrics outright and the UI hides their tabs.
// `orderBy` stays a literal rather than a widened OrderByWithAggregationInput:
// groupBy's types reject anything that could name a scalar outside `by`, and a
// widened annotation looks exactly like that to the compiler.
const WINDOW_METRICS = {
  xp: { orderBy: { _sum: { xpEarned: 'desc' } }, agg: Prisma.sql`SUM(r."xpEarned")` },
  runs: { orderBy: { _count: { userId: 'desc' } }, agg: Prisma.sql`COUNT(*)` },
  distance: { orderBy: { _sum: { distanceKm: 'desc' } }, agg: Prisma.sql`SUM(r."distanceKm")` },
} as const
type WindowedMetric = keyof typeof WINDOW_METRICS

const USER_SELECT = {
  id: true,
  name: true,
  avatar: true,
  city: true,
  xp: true,
  streak: true,
  totalRuns: true,
  totalDistanceKm: true,
  totalPeopleRunWith: true,
  paceLevel: true,
} as const

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>
type Entry = UserRow & {
  position: number
  windowXp?: number
  windowRuns?: number
  windowDistanceKm?: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Week is the default. An all-time-only board hardens into an aristocracy:
    // cumulative totals only ever grow, so whoever joined first is permanently
    // out of reach and a newcomer's best possible week changes nothing.
    const windowParam = searchParams.get('window')
    const timeWindow: TimeWindow =
      windowParam === 'all' || windowParam === 'month' ? windowParam : 'week'

    const metricParam = (searchParams.get('metric') ?? 'xp') as Metric
    let metric: Metric = metricParam in METRICS ? metricParam : 'xp'
    // A windowed request for a lifetime-only metric falls back to XP rather than
    // inventing a board; the response echoes `metric` so the client can follow.
    if (timeWindow !== 'all' && !(metric in WINDOW_METRICS)) metric = 'xp'

    // Hidden users (privacyVisible=false) opt out of discovery — and the
    // leaderboard, where name + city would otherwise expose them to strangers.
    // You always see yourself though, so hiding never makes your own rank vanish.
    const viewerId = (await getSessionUser())?.id ?? null
    const visible: Prisma.UserWhereInput = viewerId
      ? { OR: [{ privacyVisible: true }, { id: viewerId }] }
      : { privacyVisible: true }

    const board =
      timeWindow === 'all'
        ? await allTimeBoard(metric, visible, viewerId)
        : await windowedBoard(metric as WindowedMetric, timeWindow, visible, viewerId)

    return NextResponse.json({ metric, window: timeWindow, ...board })
  } catch (error) {
    console.error('Error building leaderboard:', error)
    return apiError(500, 'internal', 'Failed to build leaderboard')
  }
}

/** Lifetime board — ordered straight off the cumulative User counters. */
async function allTimeBoard(
  metric: Metric,
  visible: Prisma.UserWhereInput,
  viewerId: string | null
): Promise<{ entries: Entry[]; viewer: Entry | null }> {
  const field = METRICS[metric]

  const users = await db.user.findMany({
    where: visible,
    orderBy: { [field]: 'desc' },
    take: 50,
    select: USER_SELECT,
  })

  const entries: Entry[] = users.map((u, i) => ({ ...u, position: i + 1 }))

  // The viewer's TRUE rank, even when they're outside the top 50 — otherwise
  // the "your position" row could never render (they simply weren't in the
  // list). Their rank is however many visible users sit strictly above them.
  let viewer: Entry | null = null
  if (viewerId && !entries.some((e) => e.id === viewerId)) {
    const me = await db.user.findUnique({ where: { id: viewerId }, select: USER_SELECT })
    if (me) {
      // field is always one of the numeric metric columns.
      const myValue = Number((me as Record<string, unknown>)[field])
      const above = await db.user.count({
        where: { AND: [{ privacyVisible: true }, { [field]: { gt: myValue } }] },
      })
      viewer = { ...me, position: above + 1 }
    }
  }

  return { entries, viewer }
}

/**
 * Week/month board — ranked on the runs logged inside the window, not on the
 * User counters, so every window starts everyone from zero.
 */
async function windowedBoard(
  metric: WindowedMetric,
  timeWindow: keyof typeof WINDOW_DAYS,
  visible: Prisma.UserWhereInput,
  viewerId: string | null
): Promise<{ entries: Entry[]; viewer: Entry | null }> {
  const since = new Date(Date.now() - WINDOW_DAYS[timeWindow] * 24 * 60 * 60 * 1000)

  // The privacy filter rides along as a relation filter so the top 50 is 50
  // *visible* people — filtering after the fact would let hidden users burn
  // slots and silently shorten the board.
  const grouped = await db.runSession.groupBy({
    by: ['userId'],
    where: { endedAt: { gte: since }, user: visible },
    _sum: { xpEarned: true, distanceKm: true },
    _count: { userId: true },
    orderBy: WINDOW_METRICS[metric].orderBy,
    take: 50,
  })

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: USER_SELECT,
  })
  const byId = new Map(users.map((u) => [u.id, u]))

  // groupBy returns the ranking; findMany does not preserve it, so walk the
  // grouped rows and number the positions only after any missing user (deleted
  // between the two queries) has dropped out — otherwise the list skips a rank.
  const entries: Entry[] = grouped
    .flatMap((g) => {
      const u = byId.get(g.userId)
      return u ? [{ ...u, ...windowTotals(g) }] : []
    })
    .map((e, i) => ({ ...e, position: i + 1 }))

  let viewer: Entry | null = null
  if (viewerId && !entries.some((e) => e.id === viewerId)) {
    const me = await db.user.findUnique({ where: { id: viewerId }, select: USER_SELECT })
    if (me) {
      const mine = await db.runSession.aggregate({
        where: { userId: viewerId, endedAt: { gte: since } },
        _sum: { xpEarned: true, distanceKm: true },
        _count: { userId: true },
      })
      const totals = windowTotals(mine)
      const myValue =
        metric === 'xp'
          ? totals.windowXp
          : metric === 'distance'
            ? totals.windowDistanceKm
            : totals.windowRuns

      // Ranking here means counting the GROUPS that beat you, which Prisma can
      // only do by materialising every one of them (groupBy + having, then
      // .length) — an unbounded fetch for whoever sits at the bottom. One raw
      // COUNT comes back as a single number no matter how busy the city is.
      // The cast pins the parameter's type: COUNT is bigint, the sums are not.
      const [row] = await db.$queryRaw<{ above: number }[]>`
        SELECT COUNT(*)::int AS above FROM (
          SELECT r."userId"
          FROM "RunSession" r
          JOIN "User" u ON u.id = r."userId"
          WHERE r."endedAt" >= ${since} AND u."privacyVisible" = true
          GROUP BY r."userId"
          HAVING ${WINDOW_METRICS[metric].agg} > ${myValue}::float8
        ) rivals
      `
      // A viewer with no runs this window still gets a real row: zeroes and the
      // rank behind everyone who did run. That gap is the point of the board.
      viewer = { ...me, ...totals, position: (row?.above ?? 0) + 1 }
    }
  }

  return { entries, viewer }
}

/** Shared shape of a groupBy row and the viewer's own aggregate. */
function windowTotals(agg: {
  _sum: { xpEarned: number | null; distanceKm: number | null }
  _count: { userId: number }
}) {
  return {
    windowXp: agg._sum.xpEarned ?? 0,
    windowRuns: agg._count.userId,
    windowDistanceKm: agg._sum.distanceKm ?? 0,
  }
}
