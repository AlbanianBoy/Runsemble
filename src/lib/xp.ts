// ─── XP engine (server-only) ──────────────────────────────────────────────────
// Turns the rank system from decoration into something that actually moves when
// people participate. XP values come straight from the concept doc.

import { db } from './db'
import { getRankFromXP, type RankTier } from './ranks'

export const XP_REWARDS = {
  joinHotspot: 50, // "Joining hotspot runs (+50 XP)"
  runWithNewPerson: 30, // "Running with someone new (+30 XP)"
  streakDay: 20, // "Maintaining a streak (+20 XP/day)"
  inviteFirstRun: 100, // "Inviting someone who completes their first run (+100 XP)"
  createPost: 5, // small nudge for sharing a moment
} as const

export type XpReason = keyof typeof XP_REWARDS

export interface XpResult {
  awarded: number
  reason: XpReason
  newXp: number
  rankBefore: RankTier
  rankAfter: RankTier
  rankedUp: boolean
}

/**
 * Award XP to a user and report whether it triggered a rank-up.
 * Returns null if the user doesn't exist (e.g. a demo-only client id).
 */
export async function awardXp(userId: string, reason: XpReason): Promise<XpResult | null> {
  return awardXpAmount(userId, XP_REWARDS[reason], reason)
}

/**
 * Award an arbitrary amount of XP (used for run tracking, where the reward
 * scales with distance). Returns null if the user doesn't exist.
 */
export async function awardXpAmount(
  userId: string,
  amount: number,
  reason: XpReason = 'joinHotspot'
): Promise<XpResult | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { xp: true },
  })
  if (!user) return null

  const before = getRankFromXP(user.xp)
  const newXp = user.xp + amount
  await db.user.update({ where: { id: userId }, data: { xp: newXp } })
  const after = getRankFromXP(newXp)

  return {
    awarded: amount,
    reason,
    newXp,
    rankBefore: before.tier,
    rankAfter: after.tier,
    rankedUp: after.tier !== before.tier,
  }
}

/**
 * Describe an XP award that a *different* query is applying.
 *
 * Saving a run already updates several columns on the user in one UPDATE, so it
 * folds `xp: { increment }` into that same statement instead of calling
 * awardXpAmount. Two benefits: the XP moves inside the run's transaction rather
 * than after it, and an atomic increment replaces the read-modify-write above —
 * which silently loses one award when two runs land at the same moment.
 *
 * This computes the rank-up story from values the caller already holds, so no
 * extra read is needed to report it.
 */
export function describeXpAward(xpBefore: number, amount: number, reason: XpReason): XpResult {
  const before = getRankFromXP(xpBefore)
  const newXp = xpBefore + amount
  const after = getRankFromXP(newXp)
  return {
    awarded: amount,
    reason,
    newXp,
    rankBefore: before.tier,
    rankAfter: after.tier,
    rankedUp: after.tier !== before.tier,
  }
}

export interface BadgeSpec {
  badgeType: string
  title: string
  description: string
  icon: string
}

/**
 * Grant a badge if the user doesn't already have it. Returns the badge spec when
 * it was newly granted, or null if it already existed (so callers can decide
 * whether to celebrate).
 */
export async function grantBadge(userId: string, spec: BadgeSpec): Promise<BadgeSpec | null> {
  const existing = await db.userBadge.findUnique({
    where: { userId_badgeType: { userId, badgeType: spec.badgeType } },
  })
  if (existing) return null

  await db.userBadge.create({
    data: {
      userId,
      badgeType: spec.badgeType,
      title: spec.title,
      description: spec.description,
      icon: spec.icon,
    },
  })
  return spec
}

export const BADGES = {
  firstRun: {
    badgeType: 'first_run',
    title: 'First Run',
    description: 'Joined your very first run',
    icon: '🎉',
  },
  social5: {
    badgeType: 'social_5',
    title: 'Getting Social',
    description: 'Joined 5 runs',
    icon: '🤝',
  },
  firstTrack: {
    badgeType: 'first_track',
    title: 'On the Board',
    description: 'Tracked your first run',
    icon: '📍',
  },
  distance10: {
    badgeType: 'distance_10',
    title: '10K Club',
    description: 'Logged 10 km total',
    icon: '🏃',
  },
  distance50: {
    badgeType: 'distance_50',
    title: 'Half-Century',
    description: 'Logged 50 km total',
    icon: '🔋',
  },
  distance100: {
    badgeType: 'distance_100',
    title: 'Centurion',
    description: 'Logged 100 km total',
    icon: '💯',
  },
  streak7: {
    badgeType: 'streak_7',
    title: 'Week Warrior',
    description: 'Ran 7 days in a row',
    icon: '🔥',
  },
  streak30: {
    badgeType: 'streak_30',
    title: 'Unstoppable',
    description: 'Ran 30 days in a row',
    icon: '⚡',
  },
} as const satisfies Record<string, BadgeSpec>

// ─── Streaks ──────────────────────────────────────────────────────────────────
// A streak counts consecutive calendar days with at least one tracked run.
// Same day → no change; yesterday → +1; older gap → reset to 1.

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const da = Date.UTC(ay, am - 1, ad)
  const dbb = Date.UTC(by, bm - 1, bd)
  return Math.round((dbb - da) / 86_400_000)
}

export interface StreakResult {
  streak: number
  longestStreak: number
  lastActiveDate: string
  incremented: boolean
}

/**
 * Recompute a user's streak given their last active date. Pure — the caller
 * persists the result. `today` is injectable for testing.
 */
export function computeStreak(
  lastActiveDate: string | null,
  currentStreak: number,
  longestStreak: number,
  today = new Date()
): StreakResult {
  const todayKey = dayKey(today)

  if (!lastActiveDate) {
    return { streak: 1, longestStreak: Math.max(1, longestStreak), lastActiveDate: todayKey, incremented: true }
  }
  const gap = daysBetween(lastActiveDate, todayKey)
  if (gap <= 0) {
    // Already ran today — no streak change.
    return { streak: currentStreak || 1, longestStreak, lastActiveDate: todayKey, incremented: false }
  }
  const next = gap === 1 ? currentStreak + 1 : 1
  return {
    streak: next,
    longestStreak: Math.max(longestStreak, next),
    lastActiveDate: todayKey,
    incremented: true,
  }
}
