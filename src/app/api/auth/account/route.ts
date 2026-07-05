import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, destroySession } from '@/lib/auth'

// GDPR right to erasure: delete the account and everything attached to it.
// Every user relation cascades in the schema, so one delete wipes it all.
// Session only — nobody can delete an account they aren't logged into.
export async function DELETE() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    await db.user.delete({ where: { id: me.id } })
    await destroySession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
