// ─── /api/run-shares — the runner's own live-share link ──────────────────────
// The three things a runner does with a share from inside the app:
//
//   GET    — do I already have one live? (the tracker asks on load)
//   POST   — start one, or hand back the one I already have
//   DELETE — end it
//
// The watcher never touches this route — they read /api/run-shares/[token],
// which takes no session. Everything here is scoped to the caller's own id, so
// there is no id to pass and no way to act on someone else's share.
//
// See lib/run-share.ts for the lifecycle rules and the exact-position decision,
// and ./active-share for the one definition of "still live" all three share.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { newShareToken, SHARE_TTL_MS } from '@/lib/run-share'
import { activeShareWhere, SHARE_SUMMARY_SELECT } from './active-share'

export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // findFirst, newest first: a benign create race (see POST) can leave two
    // active rows, and the newest is the one whose token the runner was handed.
    const share = await db.runShare.findFirst({
      where: { userId: me.id, ...activeShareWhere(new Date()) },
      orderBy: { createdAt: 'desc' },
      select: SHARE_SUMMARY_SELECT,
    })
    return NextResponse.json({ share })
  } catch (error) {
    console.error('Error loading run share:', error)
    return apiError(500, 'internal', 'Failed to load share')
  }
}

export async function POST() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // Ten an hour is far above any honest use (a runner mints one per run) and
    // low enough that a compromised session can't paper the internet in live
    // location links.
    if (!(await checkRateLimit(userKey('run-share-create', me.id), 10, 60 * 60 * 1000))) {
      return apiError(429, 'rate_limited', 'Too many share links — wait a little and try again')
    }

    const now = new Date()

    // One active share per runner: if one is already live, hand back the SAME
    // token rather than minting a second. One run, one link, one thing to
    // revoke — a runner who taps Share twice must not end up with two live
    // locations to remember to kill.
    const existing = await db.runShare.findFirst({
      where: { userId: me.id, ...activeShareWhere(now) },
      orderBy: { createdAt: 'desc' },
      select: SHARE_SUMMARY_SELECT,
    })
    if (existing) return NextResponse.json({ share: existing, created: false })

    // Not wrapped in a transaction on purpose: two truly-simultaneous taps could
    // each find nothing and each create a row. That is harmless — the beacon
    // updates all active shares, DELETE ends all of them, and the extra row
    // simply expires. Guarding it would cost a lock on every share for a race a
    // single client cannot trigger.
    const share = await db.runShare.create({
      data: {
        userId: me.id,
        token: newShareToken(),
        expiresAt: new Date(now.getTime() + SHARE_TTL_MS),
      },
      select: SHARE_SUMMARY_SELECT,
    })
    return NextResponse.json({ share, created: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating run share:', error)
    return apiError(500, 'internal', 'Failed to create share')
  }
}

export async function DELETE() {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    const now = new Date()
    // endedAt, not revokedAt. Both stop the link, but the watcher is shown the
    // difference (see shareStatus precedence): 'revoked' reads as "the runner
    // cut you off", 'ended' as "the run is over". Almost every share closes
    // because the run finished, so the neutral, true word is the right default.
    // revokedAt stays reserved for an explicit "block this link" that does not
    // exist yet.
    const { count } = await db.runShare.updateMany({
      where: { userId: me.id, ...activeShareWhere(now) },
      data: { endedAt: now },
    })
    // Idempotent: ending nothing is a 200 with { ended: 0 }, never a 404. The
    // client fires this on run-save without checking whether a share exists.
    return NextResponse.json({ ended: count })
  } catch (error) {
    console.error('Error ending run share:', error)
    return apiError(500, 'internal', 'Failed to end share')
  }
}
