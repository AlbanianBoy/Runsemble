import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const posts = await db.feedPost.findMany({
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ posts })
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
    const body = await request.json()

    const { authorId, groupId, content, imageUrl, postType } = body

    if (!authorId || !content) {
      return NextResponse.json(
        { error: 'authorId and content are required' },
        { status: 400 }
      )
    }

    const post = await db.feedPost.create({
      data: {
        authorId,
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
