import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Join / leave a challenge. Identity from the session.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    await db.challengeParticipant.upsert({
      where: { challengeId_userId: { challengeId: id, userId } },
      create: { challengeId: id, userId },
      update: {},
    })
    return NextResponse.json({ ok: true, joined: true })
  } catch (error) {
    console.error('Error joining challenge:', error)
    return NextResponse.json({ error: 'Failed to join challenge' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    await db.challengeParticipant.deleteMany({ where: { challengeId: id, userId: me.id } })
    return NextResponse.json({ ok: true, joined: false })
  } catch (error) {
    console.error('Error leaving challenge:', error)
    return NextResponse.json({ error: 'Failed to leave challenge' }, { status: 500 })
  }
}
