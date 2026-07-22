import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { requireVerifiedEmail } from '@/lib/capabilities'
import { canViewPost } from '@/lib/feed-access'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError, readJson } from '@/lib/http'
import { readClientId } from '@/lib/idempotency'

// List comments for a post, oldest first.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const post = await db.feedPost.findUnique({ where: { id }, select: { groupId: true } })
    if (!post) return apiError(404, 'not_found', 'Post not found')
    const me = await getSessionUser()
    if (!(await canViewPost(post.groupId, me?.id ?? null))) {
      return apiError(403, 'forbidden', 'This post is in a private group')
    }
    const comments = await db.postComment.findMany({
      where: { postId: id },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return apiError(500, 'internal', 'Failed to fetch comments')
  }
}

// Add a comment. Keeps the post's denormalised `comments` count in sync and
// notifies the post author.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const authorId = me.id

    // Comments notify the post's author, so a burst is a burst at one person.
    if (!(await checkRateLimit(userKey('comment', me.id), 60, 60 * 60_000))) {
      return apiError(429, 'rate_limited', "You're doing that a lot — take a breather and try again")
    }

    // Anything that lands in someone else's notifications needs a confirmed
    // address behind it — see lib/capabilities.
    const unverified = requireVerifiedEmail(me)
    if (unverified) return unverified

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response
    const content = typeof parsed.body.content === 'string' ? parsed.body.content : ''

    if (!content.trim()) {
      return apiError(400, 'missing_field', 'content is required')
    }
    if (overLimit(content, LIMITS.comment)) {
      return apiError(400, 'too_long', 'Comment is too long')
    }

    const post = await db.feedPost.findUnique({ where: { id } })
    if (!post) {
      return apiError(404, 'not_found', 'Post not found')
    }
    if (!(await canViewPost(post.groupId, authorId))) {
      return apiError(403, 'forbidden', 'This post is in a private group')
    }

    const clientId = readClientId(parsed.body.clientId)
    if (clientId) {
      const already = await db.postComment.findUnique({
        where: { authorId_clientId: { authorId, clientId } },
        include: { author: { select: { id: true, name: true, avatar: true } } },
      })
      if (already) {
        const total = await db.postComment.count({ where: { postId: id } })
        return NextResponse.json({ comment: already, commentCount: total, duplicate: true })
      }
    }

    const comment = await db.postComment.create({
      data: { postId: id, authorId, content: content.trim(), clientId },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    })

    const count = await db.postComment.count({ where: { postId: id } })

    if (post.authorId !== authorId) {
      await notify({
        userId: post.authorId,
        actorId: authorId,
        type: 'comment',
        title: `${comment.author.name} commented on your post`,
        body: content.trim().slice(0, 60),
        entityId: id,
        icon: '💬',
      })
    }

    return NextResponse.json({ comment, comments: count }, { status: 201 })
  } catch (error) {
    console.error('Error creating comment:', error)
    return apiError(500, 'internal', 'Failed to create comment')
  }
}
