import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// YOUR run buddies — people you've actually run with. Session only.
export async function GET() {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const rows = await db.buddy.findMany({
      where: { userId },
      include: {
        buddy: {
          select: {
            id: true,
            name: true,
            avatar: true,
            city: true,
            paceLevel: true,
            xp: true,
            streak: true,
            isAvailable: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ buddies: rows.map((r) => r.buddy) })
  } catch (error) {
    console.error('Error fetching buddies:', error)
    return NextResponse.json({ error: 'Failed to fetch buddies' }, { status: 500 })
  }
}

// DELETE /api/buddies — stop being someone's run buddy.
//
// Until now the only exit from a buddy relationship was a full block, which is
// a heavy, hostile thing to ask of someone whose complaint is just "I don't
// know this person". Removing a buddy is the quiet option: no notification, no
// report, nothing said to anyone.
//
// It removes BOTH directions. The rows are written as a pair when a run is
// saved, and leaving the other half in place would mean you vanish from their
// list while they stay in yours — which is the confusing half-state that makes
// people reach for the block button instead.
export async function DELETE(request: Request) {
  try {
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const buddyId: unknown = body?.buddyId
    if (typeof buddyId !== 'string' || !buddyId) {
      return NextResponse.json({ error: 'buddyId is required' }, { status: 400 })
    }

    // Scoped to the caller in both directions, so this can only ever unpick a
    // pair the caller is half of.
    await db.buddy.deleteMany({
      where: {
        OR: [
          { userId: me.id, buddyId },
          { userId: buddyId, buddyId: me.id },
        ],
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error removing buddy:', error)
    return NextResponse.json({ error: 'Failed to remove buddy' }, { status: 500 })
  }
}
