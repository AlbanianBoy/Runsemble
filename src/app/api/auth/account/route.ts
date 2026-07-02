import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, destroySession } from '@/lib/auth'

// GDPR right to erasure: delete the account and everything attached to it.
// Every user relation cascades in the schema, so one delete wipes it all.
// Session-first; falls back to an explicit userId for pre-auth demo profiles.
// TODO(hardening): drop the fallback once every account has a session.
export async function DELETE(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()
    const { searchParams } = new URL(request.url)
    const userId = sessionUser?.id ?? searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    await db.user.delete({ where: { id: userId } })
    await destroySession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
