// ─── TrustBadge ──────────────────────────────────────────────────────────────
// A small credibility pill shown on stranger profiles.
// Three tiers — all derived from fields already in the public user payload;
// zero new DB columns required.
//
//  New Runner       < 3 runs      — neutral; doesn't punish newcomers
//  Verified Runner  3–9 runs      — "X runs · Y buddies"
//  Community Member ≥10 runs
//                   & ≥5 buddies  — rank icon + "X runs"

import { Shield, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrustBadgeProps {
  totalRuns: number
  totalPeopleRunWith: number
  /** When true the badge is hidden — you don't show yourself a trust signal. */
  isSelf?: boolean
  className?: string
}

export function TrustBadge({
  totalRuns,
  totalPeopleRunWith,
  isSelf = false,
  className,
}: TrustBadgeProps) {
  if (isSelf) return null

  // ── Community Member ──────────────────────────────────────────────────────
  if (totalRuns >= 10 && totalPeopleRunWith >= 5) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          'text-[10px] font-semibold leading-none',
          className,
        )}
        title={`${totalRuns} runs · ran with ${totalPeopleRunWith} people`}
      >
        <ShieldCheck className="h-3 w-3 shrink-0" />
        {totalRuns} runs
      </span>
    )
  }

  // ── Verified Runner ───────────────────────────────────────────────────────
  if (totalRuns >= 3) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
          'bg-blue-500/10 text-blue-700 dark:text-blue-400',
          'text-[10px] font-semibold leading-none',
          className,
        )}
        title={`${totalRuns} runs · ran with ${totalPeopleRunWith} ${totalPeopleRunWith === 1 ? 'person' : 'people'}`}
      >
        <Shield className="h-3 w-3 shrink-0" />
        {totalRuns} runs
        {totalPeopleRunWith > 0 && (
          <>
            <span className="opacity-40">·</span>
            <Users className="h-3 w-3 shrink-0" />
            {totalPeopleRunWith}
          </>
        )}
      </span>
    )
  }

  // ── New Runner ────────────────────────────────────────────────────────────
  // Shown neutrally — new accounts are normal, not suspicious.
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'bg-muted text-muted-foreground',
        'text-[10px] font-semibold leading-none',
        className,
      )}
    >
      New runner
    </span>
  )
}
