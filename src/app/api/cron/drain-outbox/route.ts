// ─── Notification outbox drain cron ───────────────────────────────────────────────
// Scheduled every 5 minutes via .github/workflows/crons.yml.
// Picks up NotificationOutbox rows that haven't been delivered yet and calls
// notify() for each. On success the row is marked delivered. On failure the row
// is rescheduled with a simple exponential back-off (1 min, 5 min, 30 min) and
// abandoned after 3 attempts so a broken FCM token or a deleted user can't
// block the queue forever.
//
// Why a cron and not notify() inline?
// If the serverless function that saved the run is killed between the DB commit
// and the notify() call, the notification is lost permanently — nothing retries
// it. The outbox row survives the crash; this cron finds it within 5 minutes.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { apiError } from '@/lib/http'
import type { NotifySpec } from '@/lib/notify'

// Retry schedule: attempt 0 → 1 min, attempt 1 → 5 min, attempt 2 → 30 min.
// After MAX_ATTEMPTS the row is left with deliveredAt = null and attempts = 3,
// so it can be inspected but won't be re-queued.
const MAX_ATTEMPTS = 3
const BACKOFF_MINUTES = [1, 5, 30]

export async function GET(request: Request) {
  // Vercel (or GitHub Actions) signs cron requests with CRON_SECRET. Reject
  // anything unsigned so the drain can't be triggered externally to
  // bulk-replay notifications.
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError(401, 'unauthenticated', 'Missing or invalid cron secret')
  }

  const now = new Date()

  // Fetch rows that are undelivered and due for their next attempt.
  const pending = await db.notificationOutbox.findMany({
    where: {
      deliveredAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  let delivered = 0
  let failed = 0

  for (const row of pending) {
    let spec: NotifySpec
    try {
      spec = JSON.parse(row.payload) as NotifySpec
    } catch {
      // Unparseable payload — abandon immediately, don't retry garbage.
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: { attempts: MAX_ATTEMPTS },
      })
      failed++
      continue
    }

    try {
      await notify(spec)
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: { deliveredAt: now, attempts: row.attempts + 1 },
      })
      delivered++
    } catch (e) {
      console.error(`outbox drain: failed to deliver row ${row.id}:`, e)
      const nextAttempt = row.attempts < BACKOFF_MINUTES.length
        ? new Date(now.getTime() + BACKOFF_MINUTES[row.attempts] * 60_000)
        : null // MAX_ATTEMPTS reached — stop scheduling
      await db.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts: row.attempts + 1,
          nextAttemptAt: nextAttempt,
        },
      })
      failed++
    }
  }

  return NextResponse.json({ delivered, failed, total: pending.length })
}
