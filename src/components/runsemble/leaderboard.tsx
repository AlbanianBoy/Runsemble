'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Trophy, Flame, MapPin, Zap, Users } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet } from '@/lib/api'
import { getRankFromXP } from '@/lib/ranks'
import type { LeaderboardMetric, LeaderboardResponse, LeaderboardEntry } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'

// Participation-first ordering — the boards that reward showing up and running
// together come before raw distance.
const METRICS: { id: LeaderboardMetric; label: string; icon: typeof Trophy }[] = [
  { id: 'xp', label: 'XP', icon: Zap },
  { id: 'buddies', label: 'Buddies', icon: Users },
  { id: 'streak', label: 'Streak', icon: Flame },
  { id: 'runs', label: 'Runs', icon: Trophy },
  { id: 'distance', label: 'Distance', icon: MapPin },
]

function metricValue(e: LeaderboardEntry, metric: LeaderboardMetric): string {
  switch (metric) {
    case 'distance': return `${e.totalDistanceKm.toFixed(1)} km`
    case 'streak': return `${e.streak}d`
    case 'runs': return `${e.totalRuns}`
    case 'buddies': return `${e.totalPeopleRunWith}`
    default: return `${e.xp} XP`
  }
}

const PODIUM = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const { currentUser, setProfileView } = useRunsembleStore()
  const [metric, setMetric] = useState<LeaderboardMetric>('xp')

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', metric],
    queryFn: () => apiGet<LeaderboardResponse>(`/api/leaderboard?metric=${metric}`),
  })

  const entries = data?.entries ?? []
  const top3 = entries.slice(0, 3)
  const rest = entries.slice(3)
  const myEntry = entries.find((e) => e.id === currentUser?.id)

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => setProfileView('main')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Leaderboard</h2>
      </div>

      {/* Metric toggle — scrollable so all boards fit on narrow screens */}
      <div className="flex gap-1 p-1 rounded-full bg-muted overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {METRICS.map((m) => {
          const active = metric === m.id
          return (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {active && <motion.span layoutId="lb-toggle" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative z-10">{m.label}</span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <>
          {/* Podium */}
          {top3.length > 0 && (
            <div className="flex items-end justify-center gap-3 py-2">
              {[1, 0, 2].map((slot) => {
                const e = top3[slot]
                if (!e) return <div key={slot} className="w-20" />
                const isFirst = slot === 0
                const isMe = e.id === currentUser?.id
                return (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: slot * 0.08 }}
                    className={`flex flex-col items-center ${isFirst ? 'order-2' : ''}`}
                  >
                    <div className="text-2xl mb-1">{PODIUM[slot]}</div>
                    <Avatar className={`${isFirst ? 'h-16 w-16 ring-4 ring-primary/30' : 'h-12 w-12 ring-2 ring-border'}`}>
                      <AvatarFallback className={`text-white ${isFirst ? 'text-base' : 'text-xs'} ${getAvatarColor(e.name)}`}>{getInitials(e.name)}</AvatarFallback>
                    </Avatar>
                    <p className={`font-semibold text-center mt-1.5 leading-tight ${isFirst ? 'text-sm' : 'text-xs'} ${isMe ? 'text-primary' : ''}`}>{e.name.split(' ')[0]}</p>
                    <p className="text-[11px] text-muted-foreground tabular">{metricValue(e, metric)}</p>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Rest of the list */}
          <div className="space-y-1.5">
            {rest.map((e) => (
              <Row key={e.id} entry={e} metric={metric} isMe={e.id === currentUser?.id} />
            ))}
          </div>

          {/* Your position pinned at the bottom if outside the top list */}
          {myEntry && myEntry.position > entries.length && (
            <div className="pt-2">
              <Row entry={myEntry} metric={metric} isMe />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Row({ entry, metric, isMe }: { entry: LeaderboardEntry; metric: LeaderboardMetric; isMe: boolean }) {
  const rank = getRankFromXP(entry.xp)
  return (
    <div className={`flex items-center gap-3 rounded-xl p-2.5 ${isMe ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-card'}`}>
      <span className="w-6 text-center text-sm font-bold text-muted-foreground tabular">{entry.position}</span>
      <Avatar className="h-9 w-9">
        <AvatarFallback className={`text-xs text-white ${getAvatarColor(entry.name)}`}>{getInitials(entry.name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isMe ? 'text-primary' : ''}`}>{entry.name}{isMe && ' (you)'}</p>
        <p className="text-[11px] text-muted-foreground">{rank.icon} {rank.tier}</p>
      </div>
      <span className="text-sm font-bold tabular">{metricValue(entry, metric)}</span>
    </div>
  )
}
