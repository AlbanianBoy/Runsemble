// ─── What "an active share" means, in one place ──────────────────────────────
// Three routes ask the same question — the create/get endpoint ("do I already
// have one live?"), the beacon ("which of my shares should this fix land on?"),
// and the delete ("which do I end?"). If any of them drew the line differently,
// the result would be a link that is dead to one path and alive to another: a
// runner told sharing had stopped while a watcher still saw a moving dot, or a
// beacon quietly writing a position into a share the runner thought was over.
// So the predicate lives here and each route spreads it, rather than each
// re-typing `{ endedAt: null, ... }` and one of them getting it wrong later.

import type { Prisma } from '@prisma/client'

/**
 * A share still worth pinging or showing: not ended, not revoked, and not past
 * its four-hour hard ceiling. `now` is passed in rather than read here so a
 * single request decides expiry against one clock.
 */
export function activeShareWhere(now: Date): Prisma.RunShareWhereInput {
  return { endedAt: null, revokedAt: null, expiresAt: { gt: now } }
}

/**
 * The runner-facing summary of their own share. Deliberately NOT the watcher
 * payload: this includes the token (the runner needs it to build the link) but
 * none of the position — the tracker already knows where the runner is, and
 * keeping coordinates out of this response means the runner's own polling never
 * carries a location it doesn't need.
 */
export const SHARE_SUMMARY_SELECT = {
  id: true,
  token: true,
  expiresAt: true,
  sosAt: true,
} as const
