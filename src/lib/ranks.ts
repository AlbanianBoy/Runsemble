// ─── Rank system ──────────────────────────────────────────────────────────────
// Single source of truth for rank tiers, shared by the client (profile display)
// and the server (XP award logic). Ranks are participation-based — they reward
// showing up, never pace. See the concept doc: "rewards consistency, community,
// and effort — not athletic ability."

export type RankTier =
  | 'Starter'
  | 'Jogger'
  | 'Pacer'
  | 'Regular'
  | 'Runsemble'
  | 'Elite Ensemble'

export interface RankInfo {
  tier: RankTier
  icon: string
  /** XP at which this tier begins. */
  minXP: number
  /** XP at which the next tier begins (equals minXP when already at max). */
  nextTierXP: number
  /** True when the user has reached the top tier. */
  isMax: boolean
  /** Progress through the current tier, 0..1. */
  progress: number
}

export const RANK_TIERS: { tier: RankTier; icon: string; minXP: number }[] = [
  { tier: 'Starter', icon: '🌱', minXP: 0 },
  { tier: 'Jogger', icon: '👟', minXP: 100 },
  { tier: 'Pacer', icon: '⚡', minXP: 300 },
  { tier: 'Regular', icon: '🔥', minXP: 600 },
  { tier: 'Runsemble', icon: '🏅', minXP: 1000 },
  { tier: 'Elite Ensemble', icon: '👑', minXP: 2000 },
]

export function getRankFromXP(xp: number): RankInfo {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0))

  let idx = 0
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (safeXp >= RANK_TIERS[i].minXP) {
      idx = i
      break
    }
  }

  const current = RANK_TIERS[idx]
  const isMax = idx === RANK_TIERS.length - 1
  const nextTierXP = isMax ? current.minXP : RANK_TIERS[idx + 1].minXP
  const span = isMax ? 1 : nextTierXP - current.minXP
  const progress = isMax ? 1 : Math.min(1, Math.max(0, (safeXp - current.minXP) / span))

  return { tier: current.tier, icon: current.icon, minXP: current.minXP, nextTierXP, isMax, progress }
}
