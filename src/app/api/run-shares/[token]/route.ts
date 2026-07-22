// ─── /api/run-shares/[token] — what the watcher reads ────────────────────────
// PUBLIC. No session — the person watching a run has no Runsemble account by
// design, and the token in the URL is the whole of the authorisation. That
// makes this the most exposed endpoint in the app, so it is deliberately narrow:
//
//   • The projection is toPublicRunShare's job. The Prisma `select` below hands
//     it exactly the columns it needs and NOT ONE MORE — no userId, no email, no
//     surname, no city. Whatever is not selected here cannot leak no matter what
//     the payload builder does. Do not widen it.
//   • A token that never existed and one that was ended return the same 404, so
//     the endpoint is not an oracle for which tokens are real.
//   • no-store + X-Robots-Tag on the response, and force-dynamic on the route, so
//     a live location is never cached, indexed, or served to the wrong token.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiError } from '@/lib/http'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { toPublicRunShare } from '@/lib/run-share'

// A public, unauthenticated read of a live position must never be statically
// cached or revalidated — every request resolves the current row.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params

    // Keyed on IP + token so a flood against one link, or a scan across guessed
    // tokens from one host, is throttled without penalising a real watcher
    // refreshing their own valid link.
    if (!(await checkRateLimit(`run-share-watch:${clientIp(request)}:${token}`, 120, 60_000))) {
      return apiError(429, 'rate_limited', 'Too many requests — try again in a moment')
    }

    // A real token is 43 chars (32 bytes, base64url). Anything absurdly long is
    // not one, and there is no reason to carry it into an indexed lookup.
    if (!token || token.length > 128) {
      return apiError(404, 'not_found', 'That link is no longer active')
    }

    const row = await db.runShare.findUnique({
      where: { token },
      select: {
        expiresAt: true,
        endedAt: true,
        revokedAt: true,
        lastPingAt: true,
        sosAt: true,
        lat: true,
        lng: true,
        accuracyM: true,
        distanceKm: true,
        durationSec: true,
        createdAt: true,
        user: { select: { name: true, avatar: true } },
      },
    })

    // Same answer for "no such token" and "this token is finished". The status a
    // watcher of a still-live-but-ended share should see (ended / revoked /
    // expired) is toPublicRunShare's job; the row simply not existing — because
    // the retention cron deleted it a day after expiry — is a flat 404.
    if (!row) return apiError(404, 'not_found', 'That link is no longer active')

    return NextResponse.json(toPublicRunShare(row, Date.now()), {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error) {
    console.error('Error loading watched run share:', error)
    return apiError(500, 'internal', 'Failed to load share')
  }
}
