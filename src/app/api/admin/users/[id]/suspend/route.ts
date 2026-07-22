// POST /api/admin/users/[id]/suspend — an operator suspends or reinstates an
// account. Admin-only. Suspending sets suspendedAt and drops the user's sessions
// so they're logged out on their next request; getSessionUser then refuses any
// new session and discovery hides them. This is the enforcement the report queue
// was missing — before, an operator could review a report but do nothing.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminUser } from '@/lib/admin'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError } from '@/lib/http'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser()
  if (!admin) return apiError(403, 'forbidden', 'Not authorized')

  const { id } = await params
  if (id === admin.id) {
    return apiError(400, 'invalid_value', "You can't suspend your own account")
  }

  const body = await request.json().catch(() => null)
  const suspend = body?.suspend !== false // default to suspending
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (overLimit(reason, LIMITS.bio)) {
    return apiError(400, 'too_long', 'Reason is too long')
  }

  const updated = await db.user.updateMany({
    where: { id },
    data: {
      suspendedAt: suspend ? new Date() : null,
      suspendedReason: suspend ? reason || null : null,
    },
  })
  if (updated.count === 0) {
    return apiError(404, 'not_found', 'User not found')
  }

  // Kick them now — end every active session so the suspension bites immediately
  // rather than waiting for their current session to expire.
  if (suspend) {
    await db.session.deleteMany({ where: { userId: id } }).catch(() => {})
  }

  return NextResponse.json({ ok: true, suspended: suspend })
}
