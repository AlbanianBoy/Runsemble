// ─── Retention: coarsen old run traces ───────────────────────────────────────
// GDPR storage limitation (Art. 5(1)(e)). A run's exact GPS trace starts and
// ends at the runner's door; kept forever, every stored run is a map of where
// someone lives and when they're out. After 90 days we replace the exact trace
// with the same blinded, thinned projection the feed already uses — the route
// shape survives for the owner, the home address does not. Run stats (distance,
// duration, pace) are untouched.
//
// Driven by Vercel Cron (see vercel.json). Gated on CRON_SECRET: Vercel attaches
// `Authorization: Bearer <CRON_SECRET>` to cron requests when that env var is
// set. With no secret set the endpoint refuses everything — inert until keyed,
// so it can ship before the cron is wired without leaving an open door.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toPublicPath } from '@/lib/run'

export const dynamic = 'force-dynamic'

// Keep exact traces this long, then coarsen. Mirrored in the privacy notice.
const RETENTION_DAYS = 90
// One invocation's worth. A daily cron clears any backlog over a few days
// rather than risking a timeout trying to do everything at once.
const BATCH = 200

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)

  // Only rows past the window that still hold a raw trace and haven't been done.
  // pathCoarsenedAt is the marker that makes this safe to run daily — a row is
  // touched once and never re-thinned.
  const due = await db.runSession.findMany({
    where: { endedAt: { lt: cutoff }, path: { not: null }, pathCoarsenedAt: null },
    select: { id: true, path: true },
    take: BATCH,
  })

  let coarsened = 0
  const now = new Date()
  for (const run of due) {
    await db.runSession.update({
      where: { id: run.id },
      // toPublicPath returns null when nothing safe survives (a short out-and-
      // back), which correctly drops the trace entirely. Either way the exact
      // path is gone and the row is marked so it's never reprocessed.
      data: { path: toPublicPath(run.path), pathCoarsenedAt: now },
    })
    coarsened++
  }

  return NextResponse.json({ coarsened, remaining: due.length === BATCH })
}
