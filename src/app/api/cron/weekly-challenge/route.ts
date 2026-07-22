// ─── Weekly community challenge ──────────────────────────────────────────────
// The Challenge model, the join endpoint and the progress maths all existed, but
// nothing ever CREATED a challenge — so the whole community-goal surface was
// permanently empty and read as a broken feature. This rolls one global
// challenge per week so there is always something live to join.
//
// Progress is computed on read from RunSessions (see /api/challenges), so there
// is no counter to maintain here — a challenge is just a window plus a target.
//
// Driven by Vercel Cron (see vercel.json), gated on CRON_SECRET like the
// retention job: with no secret set the endpoint refuses everything, so it ships
// inert rather than leaving an open write endpoint.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/http'

export const dynamic = 'force-dynamic'

// Rotated by week number so consecutive weeks differ, and so a re-run of the
// same week always regenerates the SAME challenge rather than a random one.
const TEMPLATES = [
  {
    title: 'Community 100',
    metric: 'distance',
    perRunner: 12, // km each, scaled by how many people are actually running
    icon: '🏃',
    description: 'Every kilometre anyone runs this week adds to one shared total.',
  },
  {
    title: 'Show Up Together',
    metric: 'runs',
    perRunner: 3, // runs each
    icon: '📅',
    description: 'Runs logged by the community this week. Short ones count.',
  },
  {
    title: 'New Faces',
    metric: 'buddies',
    perRunner: 1, // new partnerships each
    icon: '🤝',
    description: 'New running partnerships made this week — meet someone new.',
  },
] as const

/** Monday 00:00 of the week containing `d`, and the following Sunday 23:59:59. */
function weekWindow(d: Date): { start: Date; end: Date; weekIndex: number } {
  const start = new Date(d)
  const day = (start.getDay() + 6) % 7 // 0 = Monday
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  end.setMilliseconds(-1)
  // Whole weeks since the epoch — a stable rotation key.
  const weekIndex = Math.floor(start.getTime() / (7 * 86_400_000))
  return { start, end, weekIndex }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return apiError(401, 'unauthenticated', 'Unauthorized')
  }

  const { start, end, weekIndex } = weekWindow(new Date())

  // Idempotent: one global challenge per week, so a retry or an extra cron fire
  // doesn't stack duplicates on the board.
  const existing = await db.challenge.findFirst({
    where: { scope: 'global', startsAt: { gte: start, lte: end } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ created: false, reason: 'already exists for this week' })
  }

  const template = TEMPLATES[weekIndex % TEMPLATES.length]

  // Scale the target to the people actually here. A fixed "run 100km as a
  // community" is unreachable — and so demotivating it's worse than no challenge
  // — in a pilot with a handful of runners, and trivially easy in a full city.
  const since = new Date(start.getTime() - 28 * 86_400_000)
  const activeRunners = await db.runSession.findMany({
    where: { endedAt: { gte: since } },
    select: { userId: true },
    distinct: ['userId'],
  })
  const cohort = Math.max(3, activeRunners.length)
  const goal = Math.max(1, Math.round(cohort * template.perRunner))

  const challenge = await db.challenge.create({
    data: {
      title: template.title,
      description: template.description,
      metric: template.metric,
      goal,
      scope: 'global',
      icon: template.icon,
      startsAt: start,
      endsAt: end,
      createdBy: null, // system-generated
    },
    select: { id: true, title: true, metric: true, goal: true, endsAt: true },
  })

  return NextResponse.json({ created: true, challenge, cohort })
}
