'use client'

// ─── RunTracker ───────────────────────────────────────────────────────────────
// Strava-style live run tracking. The screen is map-first: you see exactly
// where you are, a green dot where you started, and the route drawing in real
// time as you move. Below the map sits a stats panel (time / distance / avg
// pace) with record controls — start, pause, resume, finish — matching the
// familiar record-screen flow.
//
// Uses the browser Geolocation API (watchPosition), accumulating distance via
// haversine with a jitter filter, and a 1s ticker that only advances while
// running. Degrades to timing-only when GPS is denied/unavailable. Mounted
// conditionally by the parent, so every open is a fresh instance.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Pause, Play, Flame, MapPin, Zap, Clock, X, Minus, Plus, Loader2, Trophy, Star, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { haversineKm, ANTWERP_CENTER, type LatLng } from '@/lib/geo'
import { formatClock, formatPaceLabel, paceFromRun } from '@/lib/run'
import type { RunSaveResponse, BuddiesResponse, HotspotResponse, GroupResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getAvatarColor, getInitials } from './helpers'

const LiveRunMap = dynamic(() => import('./live-run-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})
const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

type Phase = 'ready' | 'running' | 'paused' | 'finished'
interface GpsPoint { lat: number; lng: number; t: number }
interface Candidate { id: string; name: string }

export function RunTracker() {
  const { runContext, closeRunTracker, currentUser, updateProfile } = useRunsembleStore()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<Phase>('ready')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [distanceKm, setDistanceKm] = useState(0)
  const [splits, setSplits] = useState<number[]>([])
  const [routePoints, setRoutePoints] = useState<LatLng[]>([])
  const [pos, setPos] = useState<LatLng | null>(null)
  const [gps, setGps] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'acquiring' : 'unavailable'
  )

  // Finish-step state
  const [companions, setCompanions] = useState(0)
  const [buddyIds, setBuddyIds] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [saving, setSaving] = useState(false)

  const phaseRef = useRef<Phase>('ready')
  const elapsedRef = useRef(0)
  const lastSplitElapsedRef = useRef(0)
  const pointsRef = useRef<GpsPoint[]>([])
  const watchIdRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { elapsedRef.current = elapsedSec }, [elapsedSec])

  // 1s ticker — advances only while running.
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (phaseRef.current === 'running') setElapsedSec((s) => s + 1)
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  // GPS watch — position updates always (so the ready screen shows where you
  // are); distance/route recording only while running, with a jitter filter.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (loc) => {
        setGps('ok')
        const p: GpsPoint = { lat: loc.coords.latitude, lng: loc.coords.longitude, t: Date.now() }
        setPos({ lat: p.lat, lng: p.lng })
        if (phaseRef.current !== 'running') return

        const pts = pointsRef.current
        const last = pts[pts.length - 1]
        if (last) {
          const d = haversineKm({ lat: last.lat, lng: last.lng }, { lat: p.lat, lng: p.lng })
          // Ignore GPS jitter (<3m) and implausible jumps (>60m between samples).
          if (d > 0.003 && d < 0.06) {
            setDistanceKm((prev) => {
              const next = prev + d
              // Record a split each time we cross a whole km.
              if (Math.floor(next) > Math.floor(prev)) {
                const splitTime = elapsedRef.current - lastSplitElapsedRef.current
                lastSplitElapsedRef.current = elapsedRef.current
                setSplits((s) => [...s, splitTime])
              }
              return next
            })
            setRoutePoints((rp) => [...rp, { lat: p.lat, lng: p.lng }])
          }
        }
        pts.push(p)
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    )
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current) }
  }, [])

  // Where the map focuses before GPS locks: your saved coords, else city centre.
  const fallbackCenter: LatLng =
    currentUser?.lat != null && currentUser?.lng != null
      ? { lat: currentUser.lat, lng: currentUser.lng }
      : ANTWERP_CENTER

  const startRun = () => {
    // Seed the route with the current fix so the start point is marked
    // immediately — "where you started", Strava-style.
    if (pos) {
      pointsRef.current = [{ lat: pos.lat, lng: pos.lng, t: Date.now() }]
      setRoutePoints([pos])
    }
    setPhase('running')
  }

  // Candidate people to tag as buddies — only fetched at the finish step.
  const { data: buddiesData } = useQuery({
    queryKey: ['buddies', currentUser?.id],
    queryFn: () => apiGet<BuddiesResponse>(`/api/buddies?userId=${currentUser?.id}`),
    enabled: phase === 'finished' && !!currentUser?.id,
  })
  const { data: hotspotData } = useQuery({
    queryKey: ['hotspot', runContext?.hotspotId],
    queryFn: () => apiGet<HotspotResponse>(`/api/hotspots/${runContext?.hotspotId}`),
    enabled: phase === 'finished' && !!runContext?.hotspotId,
  })
  const { data: groupData } = useQuery({
    queryKey: ['group', runContext?.groupId],
    queryFn: () => apiGet<GroupResponse>(`/api/groups/${runContext?.groupId}`),
    enabled: phase === 'finished' && !!runContext?.groupId,
  })

  const candidates: Candidate[] = useMemo(() => {
    const map = new Map<string, Candidate>()
    hotspotData?.hotspot?.participants?.forEach((p) => {
      if (p.userId !== currentUser?.id) map.set(p.userId, { id: p.userId, name: p.user.name })
    })
    groupData?.group?.members?.forEach((m) => {
      if (m.userId !== currentUser?.id && m.user?.name) map.set(m.userId, { id: m.userId, name: m.user.name })
    })
    buddiesData?.buddies?.forEach((b) => {
      if (!map.has(b.id)) map.set(b.id, { id: b.id, name: b.name })
    })
    return [...map.values()]
  }, [hotspotData, groupData, buddiesData, currentUser?.id])

  const avgPace = paceFromRun(distanceKm, elapsedSec)
  const calories = Math.round(distanceKm * 60)

  const toggleBuddy = (id: string) =>
    setBuddyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSave = useCallback(async () => {
    if (!currentUser?.id) { toast.error('Sign in to save runs'); return }
    setSaving(true)
    try {
      const path = pointsRef.current.filter((_, i) => i % 3 === 0).map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) }))
      const res = await apiSend<RunSaveResponse>('/api/runs', 'POST', {
        userId: currentUser.id,
        distanceKm: +distanceKm.toFixed(3),
        durationSec: elapsedSec,
        hotspotId: runContext?.hotspotId ?? null,
        groupId: runContext?.groupId ?? null,
        companions,
        buddyIds,
        path,
        splits,
        rating: rating || null,
        shareToFeed,
      })

      const peopleAdded = buddyIds.length + companions
      updateProfile({
        xp: res.xp?.newXp ?? currentUser.xp,
        totalRuns: currentUser.totalRuns + 1,
        totalDistanceKm: +(currentUser.totalDistanceKm + distanceKm).toFixed(2),
        totalPeopleRunWith: currentUser.totalPeopleRunWith + peopleAdded,
        streak: res.streak.streak,
        longestStreak: res.streak.longestStreak,
      })

      ;['feed', 'runs', 'leaderboard', 'badges', 'users', 'buddies', 'challenges', 'notifications'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] })
      )

      if (res.xp?.rankedUp) toast.success(`Rank up! You're now ${res.xp.rankAfter} 🎉`)
      else toast.success(`+${res.xp?.awarded ?? 0} XP — nice run!`)
      if (res.newBuddyCount > 0) toast(`🤝 ${res.newBuddyCount} new run budd${res.newBuddyCount > 1 ? 'ies' : 'y'}!`)
      res.badgesEarned.forEach((b) => toast(`${b.icon} Badge unlocked: ${b.title}`))

      closeRunTracker()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save run')
      setSaving(false)
    }
  }, [currentUser, distanceKm, elapsedSec, runContext, companions, buddyIds, splits, rating, shareToFeed, updateProfile, queryClient, closeRunTracker])

  const label = runContext?.label ?? 'Solo run'
  const gpsNote =
    gps === 'acquiring' ? 'Acquiring GPS…' : gps === 'denied' ? 'Location off'
    : gps === 'unavailable' ? 'No GPS' : 'GPS'

  return (
    <motion.div
      className="fixed inset-0 z-[1500] flex flex-col bg-background text-foreground"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
    >
      {phase !== 'finished' ? (
        <>
          {/* Live map — where you are, where you started, the route so far */}
          <div className="relative flex-1 min-h-0">
            <LiveRunMap center={fallbackCenter} current={pos} path={routePoints} />

            {/* Overlay chips */}
            <div className="absolute top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-3 right-3 z-[600] flex items-center justify-between pointer-events-none">
              <span className="pointer-events-auto glass rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm flex items-center gap-1.5">
                {phase === 'running' && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                )}
                {label}
                {phase === 'paused' && <span className="text-muted-foreground font-medium">· paused</span>}
              </span>
              <div className="flex items-center gap-2 pointer-events-auto">
                <span className="glass rounded-full px-3 py-1.5 text-[11px] font-medium border shadow-sm flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${gps === 'ok' ? 'bg-emerald-500' : gps === 'acquiring' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                  {gpsNote}
                </span>
                {phase === 'ready' && (
                  <button
                    onClick={closeRunTracker}
                    className="glass h-8 w-8 rounded-full border shadow-sm flex items-center justify-center"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Stats + record controls */}
          <div className="border-t bg-background px-6 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">
            {phase === 'ready' ? (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-muted-foreground text-center">
                  {gps === 'ok'
                    ? 'GPS locked — ready when you are.'
                    : gps === 'acquiring'
                    ? 'Getting a GPS fix… you can start anyway.'
                    : 'No GPS here — your time will still be tracked.'}
                </p>
                <button
                  onClick={startRun}
                  className="h-20 w-20 rounded-full bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-lg shadow-orange-500/40 active:scale-95 transition-transform"
                >
                  START
                </button>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Time</p>
                  <p className="text-5xl font-bold tabular leading-tight">{formatClock(elapsedSec)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 divide-x divide-border border-t pt-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular">{distanceKm.toFixed(2)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Distance (km)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular">{formatPaceLabel(avgPace).replace(' /km', '')}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Avg pace /km</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-center gap-5">
                  {phase === 'running' ? (
                    <button
                      onClick={() => setPhase('paused')}
                      className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
                      aria-label="Pause"
                    >
                      <Pause className="h-7 w-7" fill="currentColor" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setPhase('finished')}
                        className="h-16 w-16 rounded-full bg-foreground text-background text-xs font-bold active:scale-95 transition-transform"
                      >
                        Finish
                      </button>
                      <button
                        onClick={() => setPhase('running')}
                        className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
                        aria-label="Resume"
                      >
                        <Play className="h-7 w-7 ml-0.5" fill="currentColor" />
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Finish & save */
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-1">
            <span className="text-sm font-semibold">{label}</span>
            <button onClick={closeRunTracker} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <motion.div
            className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-center mt-1 mb-4">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2"
              >
                <Trophy className="h-7 w-7" />
              </motion.div>
              <h2 className="text-2xl font-bold tracking-tight">Run complete!</h2>
            </div>

            {/* Your route */}
            {routePoints.length >= 2 && (
              <div className="h-44 rounded-2xl overflow-hidden mb-3 border">
                <RouteMap points={routePoints} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <SummaryStat icon={<MapPin className="h-4 w-4" />} value={`${distanceKm.toFixed(2)} km`} label="Distance" />
              <SummaryStat icon={<Clock className="h-4 w-4" />} value={formatClock(elapsedSec)} label="Time" />
              <SummaryStat icon={<Zap className="h-4 w-4" />} value={formatPaceLabel(avgPace)} label="Avg pace" />
              <SummaryStat icon={<Flame className="h-4 w-4" />} value={`${calories}`} label="Calories" />
            </div>

            {/* Splits */}
            {splits.length > 0 && (
              <div className="mt-3 rounded-2xl border bg-card p-4">
                <p className="text-xs font-semibold mb-2">Splits</p>
                <div className="space-y-1.5">
                  {splits.map((s, i) => {
                    const max = Math.max(...splits)
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-6 text-muted-foreground tabular">{i + 1}k</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(15, (s / max) * 100)}%` }} />
                        </div>
                        <span className="tabular w-12 text-right">{formatClock(s)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Rate the run (hotspot context) */}
            {runContext?.hotspotId && (
              <div className="mt-3 rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold mb-2">Rate this run</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                      <Star className={`h-7 w-7 ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40'}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Who did you run with? */}
            <div className="mt-3 rounded-2xl border bg-card p-4">
              <p className="text-sm font-semibold">Who did you run with?</p>
              <p className="text-xs text-muted-foreground mb-3">Tag people to become run buddies (+30 XP each)</p>
              {candidates.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {candidates.map((c) => {
                    const on = buddyIds.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleBuddy(c.id)}
                        className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition-colors ${
                          on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                        }`}
                      >
                        <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] text-white ${getAvatarColor(c.name)}`}>{getInitials(c.name)}</span>
                        {c.name.split(' ')[0]}
                        {on && <Check className="h-3 w-3" />}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Plus others not on Runsemble</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCompanions((c) => Math.max(0, c - 1))} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform" aria-label="Fewer">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center font-bold tabular">{companions}</span>
                  <button onClick={() => setCompanions((c) => Math.min(50, c + 1))} className="h-7 w-7 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform" aria-label="More">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Share */}
            <div className="mt-3 rounded-2xl border bg-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Share to feed</p>
                <p className="text-xs text-muted-foreground">Celebrate with your community</p>
              </div>
              <Switch checked={shareToFeed} onCheckedChange={setShareToFeed} />
            </div>

            <div className="mt-4 space-y-2">
              <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-full font-semibold text-base">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save run
              </Button>
              <Button onClick={closeRunTracker} variant="ghost" disabled={saving} className="w-full h-11 rounded-full text-muted-foreground">
                Discard
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

function SummaryStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">{icon}<span className="uppercase tracking-wider">{label}</span></div>
      <p className="text-xl font-bold tabular">{value}</p>
    </div>
  )
}
