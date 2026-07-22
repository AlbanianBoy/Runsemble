// ─── Retention: coarsen old run traces, purge dead live-share rows ───────────
// GDPR storage limitation (Art. 5(1)(e)). A run's exact GPS trace starts and
// ends at the runner's door; kept forever, every stored run is a map of where
// someone lives and when they're out. After 90 days we replace the exact trace
// with the same blinded, thinned projection the feed already uses — the route
// shape survives for the owner, the home address does not. Run stats (distance,
// duration, pace) are untouched.
//
// This is the app's one daily retention job, so the live-share sweep lives here
// too rather than earning a second cron entry in vercel.json. Same article,
// same reasoning, different table — see SHARE_PURGE_AFTER_MS below.
//
// Driven by Vercel Cron (see vercel.json). Gated on CRON_SECRET: Vercel attaches
// `Authorization: Bearer <CRON_SECRET>` to cron requests when that env var is
// set. With no secret set the endpoint refuses everything — inert until keyed,
// so it can ship before the cron is wired without leaving an open door.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toPublicPath } from '@/lib/run'
import { apiError } from '@/lib/http'

export const dynamic = 'force-dynamic'

// Keep exact traces this long, then coarsen. Mirrored in the privacy notice.
const RETENTION_DAYS = 90
// One invocation's worth. A daily cron clears any backlog over a few days
// rather than risking a timeout trying to do everything at once.
const BATCH = 200

// How long a dead RunShare row survives past its own expiry before deletion.
//
// A share row holds an EXACT, unblinded GPS fix — that exactness is the point
// of the feature (see the RunShare model), which is exactly why the row must
// not outlive the link. Once the URL is dead the position has no purpose left,
// and a table of purposeless positions is a location history nobody asked us to
// keep. Every share is hard-expired at four hours, so expiresAt alone catches
// all three ways a share dies: ended with the run, revoked by the runner, or
// simply timed out.
//
// 24 hours, not immediately: a runner who wants to check the share existed, or
// support answering "my friend says the link stopped working", has a day of
// grace. Much longer and the grace period quietly becomes the archive.
const SHARE_PURGE_AFTER_MS = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return apiError(401, 'unauthenticated', 'Unauthorized')
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)

  // First, and unbatched: this is one DELETE, not a per-row loop, and running it
  // ahead of the coarsening means it still happens on a night when the trace
  // backlog is large. No `take` either — dead shares must not be able to
  // accumulate faster than the job clears them.
  const { count: sharesPurged } = await db.runShare.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - SHARE_PURGE_AFTER_MS) } },
  })

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

  return NextResponse.json({ coarsened, sharesPurged, remaining: due.length === BATCH })
}
