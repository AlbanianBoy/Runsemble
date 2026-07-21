// ─── Blocks (server-only) ────────────────────────────────────────────────────
// Blocking is symmetric and one-sided to explain: once either person blocks the
// other, neither should surface in the other's app. The direction that gets
// forgotten is the reverse one — being blocked hides you from them, but it must
// also hide them from you, or a blocked user simply watches from the other side.
//
// This existed inline in /api/users and nowhere else, which is why blocked
// people still appeared in shared hotspot and lobby participant lists — a
// stranger-meetup app where "I never want to see this person" quietly doesn't
// hold in the one place you'd actually stand next to them.

import { db } from './db'

/** Ids the viewer must not see, in either block direction. */
export async function blockedUserIds(viewerId: string): Promise<string[]> {
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  })
  return blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId))
}
