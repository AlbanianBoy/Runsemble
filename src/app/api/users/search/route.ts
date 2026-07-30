import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { toPublicUser } from '@/lib/public-user'
import { apiError } from '@/lib/http'

// Find people by name. Public projection (no PII, fuzzed coords), block-aware,
// and hidden users (privacyVisible=false) stay out of search — consistent with
// them being off the map and the leaderboard.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return NextResponse.json({ users: [] })

    const me = await getSessionUser()
    const viewerId = me?.id ?? null
    let excludeIds: string[] = []
    if (viewerId) {
      const blocks = await db.block.findMany({
        where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
        select: { blockerId: true, blockedId: true },
      })
      excludeIds = blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
      excludeIds.push(viewerId) // don't show yourself in your own search
    }

    const users = await db.user.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        privacyVisible: true,
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 20,
    })

    const viewer = me ? { id: me.id, gender: me.gender, avatar: me.avatar, phoneVerified: me.phoneVerified } : null
    return NextResponse.json({ users: users.map((u) => toPublicUser(u, viewer)) })
  } catch (error) {
    console.error('Error searching users:', error)
    return apiError(500, 'internal', 'Failed to search')
  }
}
