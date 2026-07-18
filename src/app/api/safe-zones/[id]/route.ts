// DELETE /api/safe-zones/[id] — remove one of YOUR zones. deleteMany scoped to
// the session user, so guessing another user's zone id deletes nothing (and the
// 404 doesn't reveal whether the id exists at all).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getSessionUser()
  if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

  const { id } = await params
  const deleted = await db.safeZone.deleteMany({ where: { id, userId: me.id } })
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Zone not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
