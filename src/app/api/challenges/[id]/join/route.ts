import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { apiError } from '@/lib/http'

// Join / leave a challenge. Identity from the session.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id

    await db.challengeParticipant.upsert({
      where: { challengeId_userId: { challengeId: id, userId } },
      create: { challengeId: id, userId },
      update: {},
    })
    return NextResponse.json({ ok: true, joined: true })
  } catch (error) {
    console.error('Error joining challenge:', error)
    return apiError(500, 'internal', 'Failed to join challenge')
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    await db.challengeParticipant.deleteMany({ where: { challengeId: id, userId: me.id } })
    return NextResponse.json({ ok: true, joined: false })
  } catch (error) {
    console.error('Error leaving challenge:', error)
    return apiError(500, 'internal', 'Failed to leave challenge')
  }
}
