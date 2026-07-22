import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { getSessionUser } from '@/lib/auth'
import { checkRateLimit, userKey } from '@/lib/rate-limit'
import { requireVerifiedEmail } from '@/lib/capabilities'
import { LIMITS, overLimit } from '@/lib/limits'
import { apiError, boundedString, readJson, MAX_ID_LENGTH } from '@/lib/http'
import { readClientId } from '@/lib/idempotency'
import { decideDelivery, openMessageRequest } from '@/lib/message-access'

// 1:1 direct messages. Private — identity always comes from the session.
//   GET ?withId=  → the conversation with that person (marks read)
//   GET           → conversation list (latest message per partner + unread)
//   POST { recipientId, content }
export async function GET(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')
    const userId = me.id
    const { searchParams } = new URL(request.url)
    // Bounded because it goes straight into the query below. Something too long
    // to be one of our ids matches nobody anyway, so it reads as "no partner
    // asked for" and you get the conversation list.
    const withId = boundedString(searchParams.get('withId'), MAX_ID_LENGTH)

    if (withId) {
      const messages = await db.chatMessage.findMany({
        where: {
          recipientId: { not: null },
          OR: [
            { senderId: userId, recipientId: withId },
            { senderId: withId, recipientId: userId },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
      // Mark the ones sent to me as read.
      await db.chatMessage.updateMany({
        where: { senderId: withId, recipientId: userId, read: false },
        data: { read: true },
      })
      return NextResponse.json({ messages })
    }

    // Conversation list — collapse to the latest message per partner.
    //
    // Done in SQL rather than by loading every message and folding it in JS: the
    // DB returns one row per partner instead of the user's entire DM history.
    // DISTINCT ON picks each partner's newest message (dedupe first), then the
    // outer ORDER BY/LIMIT keeps the most recent conversations — capping the
    // inner scan instead would silently drop partners whose last message is old.
    const latest = await db.$queryRaw<{ partner: string; content: string; createdAt: Date }[]>`
      SELECT d.partner, d.content, d."createdAt"
      FROM (
        SELECT DISTINCT ON (t.partner) t.partner, t.content, t."createdAt"
        FROM (
          SELECT
            CASE WHEN m."senderId" = ${userId} THEN m."recipientId" ELSE m."senderId" END AS partner,
            m.content,
            m."createdAt"
          FROM "ChatMessage" m
          WHERE m."recipientId" IS NOT NULL
            AND (m."senderId" = ${userId} OR m."recipientId" = ${userId})
        ) t
        ORDER BY t.partner, t."createdAt" DESC
      ) d
      ORDER BY d."createdAt" DESC
      LIMIT 200
    `

    // Unread tallies per sender. COUNT is cast to int because Postgres returns
    // bigint, which arrives as a BigInt and would break JSON serialisation.
    const unreadRows = await db.$queryRaw<{ partner: string; unread: number }[]>`
      SELECT m."senderId" AS partner, COUNT(*)::int AS unread
      FROM "ChatMessage" m
      WHERE m."recipientId" = ${userId} AND m."read" = false
      GROUP BY m."senderId"
    `
    const unreadByPartner = new Map(unreadRows.map((r) => [r.partner, r.unread]))

    // Anyone whose request is still pending is kept OUT of this list. Their
    // message exists and is stored, but the inbox is the thing they have not
    // been let into yet — leaving them here would make the request a formality
    // and put the stranger's message on the same screen as everyone else's.
    const pending = await db.messageRequest.findMany({
      where: { recipientId: userId, status: 'pending' },
      select: { senderId: true },
    })
    const pendingSenders = new Set(pending.map((r) => r.senderId))

    const partners = await db.user.findMany({
      where: { id: { in: latest.map((r) => r.partner) } },
      select: { id: true, name: true, avatar: true },
    })
    const partnerMap = new Map(partners.map((p) => [p.id, p]))

    // `latest` already arrives newest-first, so no re-sort is needed.
    const conversations = latest
      .map((r) => {
        const partner = partnerMap.get(r.partner)
        if (!partner) return null
        if (pendingSenders.has(r.partner)) return null
        return {
          partner,
          lastMessage: r.content,
          createdAt: r.createdAt,
          unread: unreadByPartner.get(r.partner) ?? 0,
        }
      })
      .filter((c) => c !== null)

    const totalUnread = conversations.reduce((s, c) => s + c.unread, 0)
    return NextResponse.json({ conversations, totalUnread })
  } catch (error) {
    console.error('Error fetching messages:', error)
    return apiError(500, 'internal', 'Failed to fetch messages')
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await getSessionUser()
    if (!me) return apiError(401, 'unauthenticated', 'Please log in')

    // Every DM fires a push, so an unthrottled sender owns someone's lock
    // screen. 60/min is far above a fast conversation and far below a flood.
    if (!(await checkRateLimit(userKey('dm', me.id), 60, 60_000))) {
      return apiError(429, 'rate_limited', "You're doing that a lot — take a breather and try again")
    }

    // Anything that lands in someone else's notifications needs a confirmed
    // address behind it — see lib/capabilities.
    const unverified = requireVerifiedEmail(me)
    if (unverified) return unverified
    const senderId = me.id

    const parsed = await readJson(request)
    if (!parsed.ok) return parsed.response

    const recipientId = boundedString(parsed.body.recipientId, MAX_ID_LENGTH)
    // A non-string content used to reach `content?.trim()`, throw, and come back
    // as a 500 saying the message failed to send. It's the same missing-field
    // case as an empty one, and it gets the same answer.
    const content = typeof parsed.body.content === 'string' ? parsed.body.content : ''
    if (!recipientId || !content.trim()) {
      return apiError(400, 'missing_field', 'recipientId and content are required')
    }
    if (overLimit(content, LIMITS.message)) {
      return apiError(400, 'too_long', 'Message is too long')
    }

    // Respect blocks in either direction.
    const blocked = await db.block.findFirst({
      where: {
        OR: [
          { blockerId: recipientId, blockedId: senderId },
          { blockerId: senderId, blockedId: recipientId },
        ],
      },
    })
    if (blocked) return apiError(403, 'forbidden', 'Cannot message this user')

    // A send that reached the server but whose response was lost gets retried by
    // the person tapping send again. Same clientId, same row — see lib/idempotency.
    const clientId = readClientId(parsed.body.clientId)
    if (clientId) {
      const already = await db.chatMessage.findUnique({
        where: { senderId_clientId: { senderId, clientId } },
      })
      // Return the message, not an error: from the sender's side this attempt
      // succeeded, and it did — the first time.
      if (already) return NextResponse.json({ message: already, duplicate: true })
    }

    // A first message from someone you have no connection to is a request, not
    // a delivery — see lib/message-access for what counts as a connection.
    const decision = await decideDelivery(senderId, recipientId)
    if (decision.kind === 'refuse') {
      return apiError(403, 'forbidden', decision.reason)
    }

    const message = await db.chatMessage.create({
      data: { senderId, recipientId, content: content.trim(), clientId },
    })

    if (decision.kind === 'request') {
      await openMessageRequest(senderId, recipientId)
      // No notify(). The silence IS the feature: a request that pushes is a
      // message with extra steps, and the push is the part that reaches someone
      // who has not agreed to hear from you. It waits in their requests list.
      return NextResponse.json({ message, pending: true }, { status: 201 })
    }

    const sender = await db.user.findUnique({ where: { id: senderId }, select: { name: true } })
    await notify({
      userId: recipientId,
      actorId: senderId,
      actorName: sender?.name ?? null,
      type: 'group_message',
      title: `${sender?.name ?? 'Someone'} messaged you`,
      body: content.trim().slice(0, 60),
      entityId: senderId,
      icon: '✉️',
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Error sending message:', error)
    return apiError(500, 'internal', 'Failed to send message')
  }
}
