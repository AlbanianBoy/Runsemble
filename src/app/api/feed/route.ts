import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { requireVerifiedEmail } from '@/lib/capabilities'
import { LIMITS, overLimit } from '@/lib/limits'
import { storeImage, validateImageDataUrl } from '@/lib/image-store'
import { POST_TYPES, isOneOf, validateEnumFields } from '@/lib/enums'
import { toPublicPath } from '@/lib/run'
import { apiError, boundedInt, boundedString, readJson, MAX_ID_LENGTH } from '@/lib/http'
import { readClientId } from '@/lib/idempotency'

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
    // A cursor past MAX_ID_LENGTH can't be one of our ids, so it reads as no
    // cursor and you get page one — rather than carrying arbitrary length into
    // the query for Prisma to reject as a 500.
    const cursor = boundedString(searchParams.get('cursor'), MAX_ID_LENGTH)
    const limit = boundedInt(searchParams.get('limit'), 1, 100, 100)

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
            // Feeds the TrustBadge on each card. Without these two the client
            // read undefined, fell back to 0, and labelled every author on the
            // feed "New runner" — including someone with two hundred runs. A
            // trust signal that wrong is worse than no trust signal.
            totalRuns: true,
            totalPeopleRunWith: true,
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
    return apiError(500, 'internal', 'Failed to fetch feed posts')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Identity comes from the session — the client cannot post as someone else.
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // Posting is cheap for the author and loud for everyone else's feed.
    if (!(await checkRateLimit(userKey('post', me.id), 30, 60 * 60_000))) {
      return apiError(429, 'rate_limited', "You're doing that a lot — take a breather and try again")
    }

    // Anything that lands in someone else's notifications needs a confirmed
    // address behind it — see lib/capabilities.
    const unverified = requireVerifiedEmail(me)
    if (unverified) return unverified

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body

    // A groupId that isn't a string is a broken client, and it must not fall
    // through as "no group": the post would leave the private group it was
    // written for and land on the public feed. Refused, not defaulted.
    const groupId = boundedString(body.groupId, MAX_ID_LENGTH)
    if (body.groupId !== undefined && body.groupId !== null && groupId === null) {
      return apiError(400, 'invalid_value', 'Invalid group')
    }

    const content = typeof body.content === 'string' ? body.content : null
    if (!content) {
      return apiError(400, 'missing_field', 'content is required')
    }
    if (overLimit(content, LIMITS.post)) {
      return apiError(400, 'too_long', 'Post is too long')
    }

    const invalidEnum = validateEnumFields(body, { postType: POST_TYPES })
    if (invalidEnum) return apiError(400, 'invalid_value', invalidEnum)

    // Posting into a group requires membership — otherwise a non-member could
    // drop posts into any group (including private ones) by passing its id.
    if (groupId) {
      const member = await db.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: me.id } },
      })
      if (!member) return apiError(403, 'forbidden', 'Join the group to post in it')
    }

    // Photos arrive as client-compressed data URLs. The prefix is a claim, not
    // evidence — validateImageDataUrl decides the format from the actual bytes,
    // rejects SVG (a script-carrying document format) and anything that isn't a
    // real JPEG/PNG/WebP, and caps the DECODED size rather than the base64
    // string. The client's canvas re-encode is a nicety; this is the control.
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : null
    if (body.imageUrl !== undefined && body.imageUrl !== null) {
      if (imageUrl === null) {
        return apiError(400, 'invalid_value', 'Invalid image')
      }
      const check = validateImageDataUrl(imageUrl)
      if (!check.ok) {
        return apiError(400, 'invalid_value', check.error)
      }
    }

    // Before storeImage, deliberately: a retry must not upload the same photo to
    // blob storage a second time and pay for both copies.
    const clientId = readClientId(body.clientId)
    if (clientId) {
      const already = await db.feedPost.findUnique({
        where: { authorId_clientId: { authorId: me.id, clientId } },
        include: {
          author: { select: { id: true, name: true, avatar: true, paceLevel: true } },
        },
      })
      if (already) return NextResponse.json({ post: already, duplicate: true }, { status: 200 })
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
        // validateEnumFields above has already rejected anything that isn't a
        // POST_TYPES value, so this only picks the default for an absent one.
        postType: isOneOf(POST_TYPES, body.postType) ? body.postType : 'moment',
        clientId,
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
            // Feeds the TrustBadge on each card. Without these two the client
            // read undefined, fell back to 0, and labelled every author on the
            // feed "New runner" — including someone with two hundred runs. A
            // trust signal that wrong is worse than no trust signal.
            totalRuns: true,
            totalPeopleRunWith: true,
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
    return apiError(500, 'internal', 'Failed to create feed post')
  }
}
