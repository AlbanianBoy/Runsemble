import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Join / leave a challenge.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    await db.challengeParticipant.deleteMany({ where: { challengeId: id, userId } })
    return NextResponse.json({ ok: true, joined: false })
  } catch (error) {
    console.error('Error leaving challenge:', error)
    return NextResponse.json({ error: 'Failed to leave challenge' }, { status: 500 })
  }
}
