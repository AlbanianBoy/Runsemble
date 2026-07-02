import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

    const users = await db.user.findMany({
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
