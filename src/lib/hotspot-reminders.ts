import { db } from './db'
import { notify } from './notify'

// ─── Lazy hotspot reminders ───────────────────────────────────────────────────
// "Your run starts soon" notifications, without a scheduler. Vercel's free cron
// granularity is too coarse for 30-min-before reminders, so instead we sweep
// opportunistically from GET /api/hotspots (which clients poll constantly) and
// throttle it in-memory. Duplicates are prevented in the DB, so even across
// multiple serverless instances each participant is reminded at most once per
// occurrence — correctness doesn't depend on the throttle.

let lastSweep = 0
const THROTTLE_MS = 5 * 60 * 1000 // run the sweep at most every 5 minutes
const WINDOW_MS = 60 * 60 * 1000 // remind for runs starting within the next hour
const DEDUP_MS = 90 * 60 * 1000 // one reminder per person per hotspot per 90 min

export async function sweepHotspotReminders(): Promise<void> {
  const now = Date.now()
  if (now - lastSweep < THROTTLE_MS) return
  lastSweep = now
  try {
    const soon = await db.hotspot.findMany({
      where: { isActive: true, startTime: { gte: new Date(now), lte: new Date(now + WINDOW_MS) } },
      include: { participants: { select: { userId: true } } },
    })
    if (soon.length === 0) return

    const hotspotIds = soon.map((h) => h.id)
    const recent = await db.notification.findMany({
      where: { type: 'hotspot_reminder', entityId: { in: hotspotIds }, createdAt: { gte: new Date(now - DEDUP_MS) } },
      select: { userId: true, entityId: true },
    })
    const already = new Set(recent.map((n) => `${n.userId}:${n.entityId}`))

    for (const h of soon) {
      const mins = Math.max(1, Math.round((h.startTime.getTime() - now) / 60000))
      for (const p of h.participants) {
        if (already.has(`${p.userId}:${h.id}`)) continue
        await notify({
          userId: p.userId,
          type: 'hotspot_reminder',
          title: `${h.name} starts in ${mins} min ⏱️`,
          body: `Head to ${h.location} — your group run is about to begin.`,
          entityId: h.id,
          icon: '⏱️',
        })
      }
    }
  } catch (e) {
    console.error('hotspot reminder sweep failed (non-fatal):', e)
  }
}
