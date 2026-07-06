import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Personalisation (likedByMe, For-you scope) comes from the session, never
    // from a client-claimed id. Anonymous readers get the plain feed.
    const userId = (await getSessionUser())?.id ?? null
    const scope = searchParams.get('scope') ?? 'all' // all | following

    // Build the author/group filter.
    let where: import('@prisma/client').Prisma.FeedPostWhereInput = {}

    // Never show posts from people you've blocked (or who blocked you).
    if (userId) {
      const blocks = await db.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      const hiddenIds = new Set<string>()
      for (const b of blocks) hiddenIds.add(b.blockerId === userId ? b.blockedId : b.blockerId)
      if (hiddenIds.size > 0) where.authorId = { notIn: [...hiddenIds] }
    }

    // "For you" — only buddies, your groups, and yourself.
    if (scope === 'following' && userId) {
      const [buddies, memberships] = await Promise.all([
        db.buddy.findMany({ where: { userId }, select: { buddyId: true } }),
        db.groupMember.findMany({ where: { userId }, select: { groupId: true } }),
      ])
      const authorIds = [userId, ...buddies.map((b) => b.buddyId)]
      const groupIds = memberships.map((m) => m.groupId)
      where = {
        ...where,
        OR: [{ authorId: { in: authorIds } }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
      }
    }

    const posts = await db.feedPost.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            paceLevel: true,
            streak: true,
            xp: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            coverImage: true,
          },
        },
        _count: { select: { likedBy: true, commentThread: true } },
        // Shared runs render as route cards in the feed.
        runSession: {
          select: { distanceKm: true, durationSec: true, avgPaceSecPerKm: true, path: true },
        },
        // Only pull the current user's like row so we can flag likedByMe.
        likedBy: userId ? { where: { userId }, select: { id: true } } : false,
      },
      orderBy: { createdAt: 'desc' },
    })

    const shaped = posts.map((p) => {
      const { _count, likedBy, ...rest } = p
      return {
        ...rest,
        likes: _count.likedBy,
        comments: _count.commentThread,
        likedByMe: Array.isArray(likedBy) ? likedBy.length > 0 : false,
      }
    })

    return NextResponse.json({ posts: shaped })
  } catch (error) {
    console.error('Error fetching feed posts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch feed posts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Identity comes from the session — the client cannot post as someone else.
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })

    const body = await request.json()
    const { groupId, content, imageUrl, postType } = body

    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      )
    }

    // Photos arrive as client-compressed JPEG data URLs (prototype storage —
    // move to blob storage before production scale). Cap the size regardless.
    if (imageUrl !== undefined && imageUrl !== null) {
      if (typeof imageUrl !== 'string' || !imageUrl.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
      }
      if (imageUrl.length > 700_000) {
        return NextResponse.json({ error: 'Image too large — try a smaller photo' }, { status: 400 })
      }
    }

    const post = await db.feedPost.create({
      data: {
        authorId: me.id,
        groupId: groupId ?? null,
        content,
        imageUrl: imageUrl ?? null,
        postType: postType ?? 'moment',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            paceLevel: true,
            streak: true,
            xp: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            coverImage: true,
          },
        },
      },
    })

    return NextResponse.json({ post }, { status: 201 })
  } catch (error) {
    console.error('Error creating feed post:', error)
    return NextResponse.json(
      { error: 'Failed to create feed post' },
      { status: 500 }
    )
  }
}
