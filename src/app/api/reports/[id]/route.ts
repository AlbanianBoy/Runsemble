// PATCH /api/reports/[id] — an operator moves a report through the queue.
// Admin-only: the /admin page shows the queue, this is how it's actioned.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminUser } from '@/lib/admin'
import { REPORT_STATUSES, isOneOf } from '@/lib/enums'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = body?.status
  if (!isOneOf(REPORT_STATUSES, status)) {
    return NextResponse.json({ error: 'status must be one of: ' + REPORT_STATUSES.join(', ') }, { status: 400 })
  }

  // Record WHO closed it and when — the start of an audit trail. resolved and
  // dismissed are terminal; reopening (open/reviewing) clears the resolver.
  const terminal = status === 'resolved' || status === 'dismissed'
  const updated = await db.report.updateMany({
    where: { id },
    data: {
      status,
      resolvedById: terminal ? admin.id : null,
      resolvedAt: terminal ? new Date() : null,
    },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
