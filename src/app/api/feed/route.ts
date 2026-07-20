import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { LIMITS, overLimit } from '@/lib/limits'
import { storeImage } from '@/lib/image-store'
import { POST_TYPES, validateEnumFields } from '@/lib/enums'
import { toPublicPath } from '@/lib/run'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Personalisation (likedByMe, For-you scope) comes from the session, never
    // from a client-claimed id. Anonymous readers get the plain feed.
    const userId = (await getSessionUser())?.id ?? null
    const scope = searchParams.get('scope') ?? 'all' // all | following

    // Keyset pagination. `cursor` is the id of the last post of the previous
    // page; absent, you get the first one. The default page stays at 100 so a
    // caller that knows nothing about any of this behaves exactly as before.
    const cursor = searchParams.get('cursor')
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 100)

    // Compose the filter as ANDed clauses (block + visibility + scope).
    const and: import('@prisma/client').Prisma.FeedPostWhereInput[] = []

    // Never show posts from people you've blocked (or who blocked you).
    if (userId) {
      const blocks = await db.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })
      const hiddenIds = new Set<string>()
      for (const b of blocks) hiddenIds.add(b.blockerId === userId ? b.blockedId : b.blockerId)
      if (hiddenIds.size > 0) and.push({ authorId: { notIn: [...hiddenIds] } })
    }

    // Groups this viewer belongs to — used for both post visibility and "for you".
    const myGroupIds = userId
      ? (await db.groupMember.findMany({ where: { userId }, select: { groupId: true } })).map((m) => m.groupId)
      : []

    // Group visibility: a post shows only if it's personal, in a public group, or
    // in a group the viewer belongs to. Without this, private-group posts leak
    // into everyone's feed (and via a buddy's post into the "for you" feed too).
    and.push({
      OR: [
        { groupId: null },
        { group: { isPublic: true } },
        ...(myGroupIds.length ? [{ groupId: { in: myGroupIds } }] : []),
      ],
    })

    // "For you" — only buddies, your groups, and yourself.
    if (scope === 'following' && userId) {
      const buddies = await db.buddy.findMany({ where: { userId }, select: { buddyId: true } })
      const authorIds = [userId, ...buddies.map((b) => b.buddyId)]
      and.push({
        OR: [{ authorId: { in: authorIds } }, ...(myGroupIds.length ? [{ groupId: { in: myGroupIds } }] : [])],
      })
    }

    const where: import('@prisma/client').Prisma.FeedPostWhereInput = and.length ? { AND: and } : {}

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
      // id breaks ties on createdAt. Without it, two posts sharing a timestamp
      // have no defined order, and a page boundary landing between them can
      // repeat one and drop the other.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One more than asked for: if it comes back, there's another page. Cheaper
      // and more honest than a second count() query, which could disagree with
      // this one anyway.
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = posts.length > limit
    const page = hasMore ? posts.slice(0, limit) : posts

    const shaped = page.map((p) => {
      const { _count, likedBy, ...rest } = p
      return {
        ...rest,
        // A shared run's GPS trace starts and ends at the runner's door. Only
        // the author gets the real thing back; everyone else sees the route
        // with both ends blinded and the middle thinned.
        runSession: rest.runSession
          ? {
              ...rest.runSession,
              path:
                userId && rest.author?.id === userId
                  ? rest.runSession.path
                  : toPublicPath(rest.runSession.path),
            }
          : rest.runSession,
        likes: _count.likedBy,
        comments: _count.commentThread,
        likedByMe: Array.isArray(likedBy) ? likedBy.length > 0 : false,
      }
    })

    // null rather than absent, so "no more pages" is stated rather than inferred.
    const nextCursor = hasMore ? page[page.length - 1].id : null
    return NextResponse.json({ posts: shaped, nextCursor })
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
    if (overLimit(content, LIMITS.post)) {
      return NextResponse.json({ error: 'Post is too long' }, { status: 400 })
    }

    const invalidEnum = validateEnumFields(body, { postType: POST_TYPES })
    if (invalidEnum) return NextResponse.json({ error: invalidEnum }, { status: 400 })

    // Posting into a group requires membership — otherwise a non-member could
    // drop posts into any group (including private ones) by passing its id.
    if (groupId) {
      const member = await db.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: me.id } },
      })
      if (!member) return NextResponse.json({ error: 'Join the group to post in it' }, { status: 403 })
    }

    // Photos arrive as client-compressed JPEG data URLs. Cap the size before we
    // do anything with the bytes.
    if (imageUrl !== undefined && imageUrl !== null) {
      if (typeof imageUrl !== 'string' || !imageUrl.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
      }
      if (imageUrl.length > 700_000) {
        return NextResponse.json({ error: 'Image too large — try a smaller photo' }, { status: 400 })
      }
    }

    // Hand the photo to blob storage when it's configured, so the row holds a URL
    // instead of the whole image. Falls back to the inline data URL otherwise.
    const storedImageUrl = imageUrl ? await storeImage(imageUrl) : null

    const post = await db.feedPost.create({
      data: {
        authorId: me.id,
        groupId: groupId ?? null,
        content,
        imageUrl: storedImageUrl,
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
