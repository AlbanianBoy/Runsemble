'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowLeft, Trophy, Users, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { ApiChallenge, ChallengesResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function metricUnit(m: string) {
  return m === 'distance' ? 'km' : m === 'buddies' ? 'buddies' : 'runs'
}
function daysLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  const d = Math.max(0, Math.ceil(ms / 86_400_000))
  return d === 0 ? 'ends today' : `${d} day${d > 1 ? 's' : ''} left`
}

export function ChallengesView() {
  const { currentUser, setProfileView } = useRunsembleStore()
  const queryClient = useQueryClient()
  const uid = currentUser?.id

  const { data, isLoading } = useQuery({
    queryKey: ['challenges', uid],
    queryFn: () => apiGet<ChallengesResponse>(`/api/challenges?userId=${uid ?? ''}`),
  })
  const challenges = data?.challenges ?? []

  const joinMut = useMutation({
    mutationFn: ({ id, joined }: { id: string; joined: boolean }) =>
      joined
        ? apiSend(`/api/challenges/${id}/join?userId=${uid}`, 'DELETE')
        : apiSend(`/api/challenges/${id}/join`, 'POST', { userId: uid }),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['challenges', uid] })
      if (!v.joined) toast.success("You're in! Every run counts now 💪")
    },
  })

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => setProfileView('main')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold">Challenges</h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
      ) : challenges.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No active challenges right now.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {challenges.map((c) => <ChallengeCard key={c.id} c={c} onToggle={() => joinMut.mutate({ id: c.id, joined: c.joined })} pending={joinMut.isPending} />)}
        </div>
      )}
    </div>
  )
}

function ChallengeCard({ c, onToggle, pending }: { c: ApiChallenge; onToggle: () => void; pending: boolean }) {
  // Group/global collective challenges show community progress; otherwise yours.
  const collective = c.scope === 'global'
  const value = collective ? c.totalProgress : c.myProgress
  const pct = Math.min(100, c.goal > 0 ? (value / c.goal) * 100 : 0)

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="text-3xl">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{c.title}</p>
              {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
            </div>
            <Button size="sm" variant={c.joined ? 'secondary' : 'default'} className="rounded-full shrink-0" onClick={onToggle} disabled={pending}>
              {c.joined ? 'Joined' : 'Join'}
            </Button>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium tabular">
                {collective ? 'Community' : 'You'}: {Math.round(value * 10) / 10} / {c.goal} {metricUnit(c.metric)}
              </span>
              <span className="text-muted-foreground">{Math.round(pct)}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full bg-primary rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
            </div>
            {c.joined && collective && (
              <p className="text-[11px] text-muted-foreground mt-1.5">Your contribution: {Math.round(c.myProgress * 10) / 10} {metricUnit(c.metric)}</p>
            )}
          </div>

          <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{c.participantCount} in</span>
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{daysLeft(c.endsAt)}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
