import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'

// Toggle a like for a post on behalf of a user. Idempotent per (post, user):
// calling it flips the like on/off and keeps the denormalised `likes` count in
// sync with the real PostLike rows. Returns the fresh count and whether the
// user now likes the post.
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

    const existing = await db.postLike.findUnique({
      where: { postId_userId: { postId: id, userId } },
    })

    let liked: boolean
    if (existing) {
      await db.postLike.delete({ where: { id: existing.id } })
      liked = false
    } else {
      await db.postLike.create({ data: { postId: id, userId } })
      liked = true
      // Let the author know someone liked their post.
      if (post.authorId !== userId) {
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
    }

    // Recompute the real count and persist it to the denormalised column so
    // list views that don't join PostLike stay correct.
    const likes = await db.postLike.count({ where: { postId: id } })
    await db.feedPost.update({ where: { id }, data: { likes } })

    return NextResponse.json({ liked, likes })
  } catch (error) {
    console.error('Error toggling like:', error)
    return NextResponse.json({ error: 'Failed to like post' }, { status: 500 })
  }
}
