'use client'

// ─── RunLobby ─────────────────────────────────────────────────────────────────
// The pre-run gathering screen for a group (hotspot) run — this is what makes
// starting together feel different from starting alone. You see everyone who
// joined, who's physically checked in ("here"), and once you've checked in you
// can start the run for the whole group. Clients poll every 3 seconds, so when
// anyone taps "Start together", everyone's tracker starts within moments.

import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { X, MapPin, Clock, CheckCircle2, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { LatLng } from '@/lib/geo'
import type { LobbyResponse, LobbyActionResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { getAvatarColor, getInitials } from './helpers'

export interface RunLobbyProps {
  /** Exactly one of these: the hotspot or the group whose lobby this is. */
  hotspotId?: string
  groupId?: string
  /** Latest GPS fix from the tracker, for the geofenced hotspot check-in. */
  pos: LatLng | null
  onClose: () => void
  /** Fired when the run starts (by you or anyone) with the other checked-in runners. */
  onStarted: (others: { id: string; name: string }[]) => void
}

function othersHere(lobby: LobbyResponse, myId: string | undefined) {
  return lobby.participants
    .filter((p) => p.status === 'here' && p.userId !== myId)
    .map((p) => ({ id: p.userId, name: p.user.name }))
}

export function RunLobby({ hotspotId, groupId, pos, onClose, onStarted }: RunLobbyProps) {
  const { currentUser } = useRunsembleStore()
  const queryClient = useQueryClient()
  const myId = currentUser?.id

  // One lobby component, two backends with the same contract.
  const lobbyUrl = hotspotId
    ? `/api/hotspots/${hotspotId}/lobby`
    : `/api/groups/${groupId}/lobby`
  const lobbyKey = ['lobby', hotspotId ?? groupId]

  const { data, isLoading } = useQuery({
    queryKey: lobbyKey,
    queryFn: () => apiGet<LobbyResponse>(lobbyUrl),
    refetchInterval: 3000,
  })

  const me = data?.participants.find((p) => p.userId === myId)
  const checkedIn = me?.status === 'here'
  const hereCount = data?.participants.filter((p) => p.status === 'here').length ?? 0

  const act = useMutation({
    mutationFn: (action: 'checkin' | 'start') =>
      apiSend<LobbyActionResponse>(lobbyUrl, 'POST', {
        action,
        lat: pos?.lat,
        lng: pos?.lng,
      }),
    onSuccess: (res, action) => {
      queryClient.setQueryData(lobbyKey, res.lobby)
      if (action === 'checkin' && res.xp) {
        toast.success(`+${res.xp.awarded} XP for showing up ✅`)
      }
      if (action === 'start') {
        onStarted(othersHere(res.lobby, myId))
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // When someone ELSE starts the run, our polling picks it up — start too.
  // (setTimeout keeps the state change out of the synchronous effect body.)
  const onStartedRef = useRef(onStarted)
  useEffect(() => { onStartedRef.current = onStarted }, [onStarted])
  useEffect(() => {
    if (!data?.lobbyStartedAt) return
    const others = othersHere(data, myId)
    const t = setTimeout(() => onStartedRef.current(others), 0)
    return () => clearTimeout(t)
  }, [data, myId])

  // Groups have no fixed start time — only show the clock for hotspot runs.
  const startLabel = data?.hotspot.startTime
    ? new Date(data.hotspot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Users className="h-4 w-4 text-primary" />Run lobby
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] flex-1 flex flex-col">
        {isLoading || !data ? (
          <div className="space-y-3 mt-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full rounded-2xl mt-4" />
          </div>
        ) : (
          <>
            {/* Run header */}
            <h2 className="text-2xl font-bold tracking-tight">{data.hotspot.name}</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{data.hotspot.location}</span>
              {startLabel && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{startLabel}</span>
              )}
            </div>

            {/* Who's in */}
            <div className="mt-5 rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Who&apos;s in
                </p>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular">
                  {hereCount} here
                </span>
              </div>
              <div className="divide-y">
                {data.participants.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">
                    No one has joined yet — be the first to check in.
                  </p>
                )}
                {data.participants.map((p) => {
                  const here = p.status === 'here'
                  const isMe = p.userId === myId
                  return (
                    <div key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="relative">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={`text-xs text-white ${getAvatarColor(p.user.name)}`}>
                            {getInitials(p.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        {here && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.user.name}{isMe && ' (you)'}
                        </p>
                        <p className="text-[11px] text-muted-foreground capitalize">{p.user.paceLevel}</p>
                      </div>
                      {here ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />Here
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Joined</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto pt-6">
              {!checkedIn ? (
                <>
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    {groupId
                      ? "Check in when you're with the group."
                      : pos
                      ? 'Check in when you reach the start point.'
                      : 'No GPS here — you can still check in.'}
                  </p>
                  <Button
                    className="w-full h-12 rounded-full font-semibold text-base"
                    onClick={() => act.mutate('checkin')}
                    disabled={act.isPending || !myId}
                  >
                    {act.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    I&apos;m here
                  </Button>
                </>
              ) : (
                <>
                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-xs text-muted-foreground text-center mb-3"
                  >
                    {hereCount > 1
                      ? `You're checked in — ${hereCount} runner${hereCount > 1 ? 's' : ''} ready. Starting begins the run for everyone.`
                      : "You're checked in. Start now, or wait for others to arrive."}
                  </motion.p>
                  <Button
                    className="w-full h-12 rounded-full font-semibold text-base"
                    onClick={() => act.mutate('start')}
                    disabled={act.isPending}
                  >
                    {act.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Start together{hereCount > 1 ? ` (${hereCount})` : ''}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
