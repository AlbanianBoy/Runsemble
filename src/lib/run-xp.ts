// ─── What a run pays ──────────────────────────────────────────────────────────
// Shared by the server, which awards it, and the run tracker, which shows it
// climbing while you run.
//
// It lived inline in /api/runs, so the tracker had no way to show XP accruing
// without a second copy of the arithmetic — and a second copy drifts. The one
// that drifts is always the display, which then quietly lies about the reward
// right up until the moment the run is saved and the number changes.
//
// No imports, deliberately: lib/xp.ts pulls in the Prisma client, so this could
// not live there without dragging the database into the browser bundle.

/** Showing up. Paid once, so a 200m run still counts for something. */
const XP_BASE = 20
/** Effort, per kilometre. */
const XP_PER_KM = 10
/** How many people a single run pays social XP for. */
export const XP_PAID_PEOPLE = 3
const XP_PER_NEW_BUDDY = 30
const XP_PER_COMPANION = 15
/**
 * A backstop ABOVE the legitimate maximum — a GPS-verified 200km run at 10/km
 * plus 20 buddies and 20 companions tops out around 2920 — so it never clips a
 * real ultra. It only trips if a future change reintroduces an unbounded term.
 */
export const MAX_RUN_XP = 3200

export interface RunXpInput {
  distanceKm: number
  /** People tagged who weren't already buddies — the "met someone new" moment. */
  newBuddies?: number
  /** People you ran with but didn't tag. */
  untaggedCompanions?: number
}

/**
 * XP for one run.
 *
 * The social part is paid on the FIRST few people only, never linearly per head.
 * Linear per-person XP made "collect as many people as possible" the optimal
 * play, which is what turned buddy-tagging into something you do TO someone
 * rather than with them. A group run still pays more than a solo one; tagging
 * twenty strangers pays the same as running with three friends.
 */
export function runXp({ distanceKm, newBuddies = 0, untaggedCompanions = 0 }: RunXpInput): number {
  const km = Math.max(0, Number(distanceKm) || 0)
  const paidBuddies = Math.min(Math.max(0, newBuddies), XP_PAID_PEOPLE)
  const paidCompanions = Math.min(Math.max(0, untaggedCompanions), XP_PAID_PEOPLE)
  return Math.min(
    MAX_RUN_XP,
    XP_BASE + Math.round(km * XP_PER_KM) + paidBuddies * XP_PER_NEW_BUDDY + paidCompanions * XP_PER_COMPANION
  )
}
