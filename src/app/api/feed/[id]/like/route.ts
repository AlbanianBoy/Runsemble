import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { canViewPost } from '@/lib/feed-access'

// Toggle a like for a post on behalf of a user. Idempotent per (post, user):
// calling it flips the like on/off. The PostLike rows are the only source of
// truth — the count is derived, so there is no second copy to drift from.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const me = await getSessionUser()
    if (!me) return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    const userId = me.id

    const post = await db.feedPost.findUnique({ where: { id } })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    if (!(await canViewPost(post.groupId, userId))) {
      return NextResponse.json({ error: 'This post is in a private group' }, { status: 403 })
    }

    const existing = await db.postLike.findUnique({
      where: { postId_userId: { postId: id, userId } },
    })

    const liked = !existing
    if (existing) {
      await db.postLike.delete({ where: { id: existing.id } })
    } else {
      await db.postLike.create({ data: { postId: id, userId } })
    }
    const likes = await db.postLike.count({ where: { postId: id } })

    // Notify the post author — outside the transaction since it's best-effort.
    if (liked && post.authorId !== userId) {
      const actor = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
      await notify({
        userId: post.authorId,
        actorId: userId,
        type: 'like',
        title: `${actor?.name ?? 'Someone'} liked your post`,
        body: post.content.slice(0, 60),
        entityId: id,
        icon: '❤️',
      })
    }

    return NextResponse.json({ liked, likes })
  } catch (error) {
    console.error('Error toggling like:', error)
    return NextResponse.json({ error: 'Failed to like post' }, { status: 500 })
  }
}
