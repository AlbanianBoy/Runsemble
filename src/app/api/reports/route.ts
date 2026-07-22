// POST /api/reports — flag a user, post, or message for an operator to review.
//
// Block only hides someone from the person who blocked them; it tells nobody.
// This app puts strangers in the same park, so a report that an operator can
// actually see is a safety requirement. The subject's content is snapshotted here,
// server-side, so it survives the subject deleting it before anyone looks.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import { REPORT_SUBJECT_TYPES, REPORT_REASONS, isOneOf } from '@/lib/enums'

const MAX_DETAILS = 1000

export async function POST(request: NextRequest) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

  // Filing a report is cheap to abuse — a stream of them is a way to harass a
  // moderator, or to bury a real report. Bound it per account.
  if (!(await checkRateLimit(`report:${me.id}:${clientIp(request)}`, 20, 60 * 60_000))) {
    return NextResponse.json({ error: 'Too many reports — please slow down' }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const subjectType = body?.subjectType
  const subjectId = body?.subjectId
  const reason = body?.reason
  const details = typeof body?.details === 'string' ? body.details.slice(0, MAX_DETAILS) : null

  if (!isOneOf(REPORT_SUBJECT_TYPES, subjectType)) {
    return NextResponse.json({ error: 'subjectType must be one of: ' + REPORT_SUBJECT_TYPES.join(', ') }, { status: 400 })
  }
  if (typeof subjectId !== 'string' || !subjectId) {
    return NextResponse.json({ error: 'subjectId is required' }, { status: 400 })
  }
  if (!isOneOf(REPORT_REASONS, reason)) {
    return NextResponse.json({ error: 'reason must be one of: ' + REPORT_REASONS.join(', ') }, { status: 400 })
  }
  if (subjectType === 'user' && subjectId === me.id) {
    return NextResponse.json({ error: 'You cannot report yourself' }, { status: 400 })
  }

  // Confirm the subject exists AND snapshot it, in one lookup. A report on a
  // nonexistent id is noise; a snapshot means a post deleted an hour later is
  // still reviewable.
  const evidence = await snapshotSubject(subjectType, subjectId)
  if (evidence === null) {
    return NextResponse.json({ error: 'That content no longer exists' }, { status: 404 })
  }

  // One report per person per subject: re-filing updates it rather than stacking,
  // so a single reporter can't flood the queue. Different reporters still each get
  // their own row — many reports on one subject is the signal worth seeing.
  await db.report.upsert({
    where: { reporterId_subjectType_subjectId: { reporterId: me.id, subjectType, subjectId } },
    create: { reporterId: me.id, subjectType, subjectId, reason, details, evidence: JSON.stringify(evidence) },
    update: { reason, details, evidence: JSON.stringify(evidence), status: 'open', resolvedById: null, resolvedAt: null },
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

/** Existence check + evidence snapshot. Returns null when the subject is gone. */
async function snapshotSubject(
  subjectType: 'user' | 'post' | 'message',
  subjectId: string
): Promise<Record<string, unknown> | null> {
  if (subjectType === 'user') {
    const u = await db.user.findUnique({ where: { id: subjectId }, select: { id: true, name: true, bio: true, city: true } })
    return u ?? null
  }
  if (subjectType === 'post') {
    const p = await db.feedPost.findUnique({
      where: { id: subjectId },
      select: { id: true, content: true, authorId: true, createdAt: true },
    })
    return p ?? null
  }
  // message
  const m = await db.chatMessage.findUnique({
    where: { id: subjectId },
    select: { id: true, content: true, senderId: true, createdAt: true },
  })
  return m ?? null
}
