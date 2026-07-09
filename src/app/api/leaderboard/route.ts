import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const metricParam = (searchParams.get('metric') ?? 'xp') as Metric
    const metric: Metric = metricParam in METRICS ? metricParam : 'xp'
    const field = METRICS[metric]

    // Hidden users (privacyVisible=false) opt out of discovery — and the
    // leaderboard, where name + city would otherwise expose them to strangers.
    // You always see yourself though, so hiding never makes your own rank vanish.
    const viewerId = (await getSessionUser())?.id ?? null
    const where = viewerId
      ? { OR: [{ privacyVisible: true }, { id: viewerId }] }
      : { privacyVisible: true }

    const users = await db.user.findMany({
      where,
      orderBy: { [field]: 'desc' },
      take: 50,
      select: {
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
      },
    })

    const entries = users.map((u, i) => ({ ...u, position: i + 1 }))
    return NextResponse.json({ metric, entries })
  } catch (error) {
    console.error('Error building leaderboard:', error)
    return NextResponse.json({ error: 'Failed to build leaderboard' }, { status: 500 })
  }
}
