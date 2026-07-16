import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { canViewPost } from '@/lib/feed-access'

// Toggle a like for a post on behalf of a user. The PostLike rows are the only
// source of truth — the count is derived, so there is no second copy to drift
// from — and the toggle is safe to fire twice at once (see below).
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

    // Toggle without reading first. Checking for the row and then acting on it
    // is two round trips, and a double tap fits between them: both requests see
    // the same like and both try to remove it, so the loser blows up on a row
    // that is already gone (P2025). Let the write itself decide instead —
    // deleteMany reports how many rows it removed and is happy with none.
    const removed = await db.postLike.deleteMany({ where: { postId: id, userId } })
    const liked = removed.count === 0
    if (liked) {
      try {
        await db.postLike.create({ data: { postId: id, userId } })
      } catch (error) {
        // P2002: a concurrent request added the like first. Same end state, so
        // this isn't a failure — anything else is.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error
        }
      }
    }
    const likes = await db.postLike.count({ where: { postId: id } })

    // Notify the post author — best-effort, so it stays out of the write path.
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
