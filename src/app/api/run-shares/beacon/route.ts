// ─── /api/run-shares/beacon — the running phone posting where it is ──────────
// Called every ~20s while a run with a live share is going. It writes the fix
// onto every active share the caller owns and, if asked, raises the SOS flag.
//
// Two things here are deliberately forgiving rather than strict, because this is
// a fire-and-forget loop on a phone with a flaky link, and an error it raises is
// an error the runner cannot act on mid-run:
//
//   • When the caller has no active share (they revoked it, or the run just
//     ended in a race with this ping) the answer is { active: 0 }, not a 4xx.
//     The client reads the 0 and stops beaconing. A 404 here would light up
//     Sentry with something that is not a fault.
//   • The position stats (distance, duration) are cosmetic — what the watcher
//     reads under the map — so a bad number is clamped, not rejected. The
//     coordinates are not: a wrong lat/lng would put the runner somewhere they
//     are not, which is the one thing a safety feature must never do, so those
//     are validated and refused.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError, readJson, boundedInt } from '@/lib/http'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { activeShareWhere } from '../active-share'

// A run share is hard-capped at four hours, so nothing legitimate exceeds these.
// They exist only to stop a compromised client writing nonsense into the row.
const MAX_DISTANCE_KM = 1000
const MAX_DURATION_SEC = 24 * 60 * 60

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // Forty a minute is three times the 20s cadence — headroom for a resumed
    // run flushing buffered fixes, still a ceiling on abuse.
    if (!(await checkRateLimit(userKey('run-share-beacon', me.id), 40, 60_000))) {
      return apiError(429, 'rate_limited', 'Slow down')
    }

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const { body } = parsed

    const lat = Number(body.lat)
    const lng = Number(body.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return apiError(400, 'invalid_value', 'A valid lat/lng is required')
    }

    if (body.sos !== undefined && typeof body.sos !== 'boolean') {
      return apiError(400, 'invalid_value', 'sos must be true or false')
    }

    // accuracyM is optional; a missing or unusable value is "unknown", not an error.
    const accuracyRaw = Number(body.accuracyM)
    const accuracyM = Number.isFinite(accuracyRaw) && accuracyRaw >= 0 ? accuracyRaw : null

    const distanceKm = Number(body.distanceKm)
    const distance = Number.isFinite(distanceKm) ? Math.min(Math.max(distanceKm, 0), MAX_DISTANCE_KM) : 0
    const duration = boundedInt(body.durationSec, 0, MAX_DURATION_SEC, 0)

    const now = new Date()
    const scope = { userId: me.id, ...activeShareWhere(now) }

    const { count } = await db.runShare.updateMany({
      where: scope,
      data: { lat, lng, accuracyM, lastPingAt: now, distanceKm: distance, durationSec: duration },
    })

    // SOS is set as its OWN scoped update, guarded on sosAt: null, so re-arming
    // never moves the alarm's time — "raised at 19:04" must stay 19:04. Only run
    // it when there was an active share to write the fix onto in the first place.
    if (body.sos === true && count > 0) {
      await db.runShare.updateMany({
        where: { ...scope, sosAt: null },
        data: { sosAt: now },
      })
    }

    // The count tells the client whether the share is still alive. Zero means
    // stop beaconing — the share was ended or revoked server-side.
    return NextResponse.json({ active: count })
  } catch (error) {
    console.error('Error updating run share beacon:', error)
    return apiError(500, 'internal', 'Failed to update share')
  }
}
