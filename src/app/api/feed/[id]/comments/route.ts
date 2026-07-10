import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { canViewPost } from '@/lib/feed-access'
import { LIMITS, overLimit } from '@/lib/limits'

// List comments for a post, oldest first.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const post = await db.feedPost.findUnique({ where: { id }, select: { groupId: true } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    const me = await getSessionUser()
    if (!(await canViewPost(post.groupId, me?.id ?? null))) {
      return NextResponse.json({ error: 'This post is in a private group' }, { status: 403 })
    }
    const comments = await db.postComment.findMany({
      where: { postId: id },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
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
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const authorId = me.id

    const body = await request.json()
    const { content } = body
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    if (overLimit(content, LIMITS.comment)) {
      return NextResponse.json({ error: 'Comment is too long' }, { status: 400 })
    }

    const post = await db.feedPost.findUnique({ where: { id } })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    if (!(await canViewPost(post.groupId, authorId))) {
      return NextResponse.json({ error: 'This post is in a private group' }, { status: 403 })
    }

    const comment = await db.postComment.create({
      data: { postId: id, authorId, content: content.trim() },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    })

    const count = await db.postComment.count({ where: { postId: id } })
    await db.feedPost.update({ where: { id }, data: { comments: count } })

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
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
