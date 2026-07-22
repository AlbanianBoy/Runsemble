// DELETE /api/safe-zones/[id] — remove one of YOUR zones. deleteMany scoped to
// the session user, so guessing another user's zone id deletes nothing (and the
// 404 doesn't reveal whether the id exists at all).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getSessionUser()
  if (!me) return apiError(401, 'unauthenticated', 'Please log in')

  const { id } = await params
  const deleted = await db.safeZone.deleteMany({ where: { id, userId: me.id } })
  if (deleted.count === 0) {
    return apiError(404, 'not_found', 'Zone not found')
  }
  return NextResponse.json({ ok: true })
}
