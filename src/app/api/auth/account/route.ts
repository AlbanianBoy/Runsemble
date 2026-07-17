import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, destroySession } from '@/lib/auth'
import { deleteStoredImages } from '@/lib/image-store'

// GDPR right to erasure: delete the account and everything attached to it.
// Every user relation cascades in the schema, so one delete wipes the rows —
// but a cascade can't reach object storage, so post photos are collected and
// deleted from Blob explicitly, BEFORE the rows that know their URLs are gone.
// Session only — nobody can delete an account they aren't logged into.
export async function DELETE() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const posts = await db.feedPost.findMany({
      where: { authorId: me.id, imageUrl: { not: null } },
      select: { imageUrl: true },
    })
    await deleteStoredImages(posts.map((p) => p.imageUrl))

    await db.user.delete({ where: { id: me.id } })
    await destroySession()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
