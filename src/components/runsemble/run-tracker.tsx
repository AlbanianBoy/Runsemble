'use client'

// ─── RunTracker ───────────────────────────────────────────────────────────────
// A full-screen live run tracker (Nike/Strava-style): 3-2-1 countdown, a big
// tappable primary metric, live per-km splits, and a finish summary with the
// drawn route, splits, a star rating, and a "who did you run with?" buddy picker.
//
// Uses the browser Geolocation API (watchPosition) for a real GPS track,
// accumulating distance with the haversine formula and timing with a 1s ticker
// that only advances while running. Degrades gracefully to timing-only when GPS
// is denied/unavailable. Mounted conditionally by the parent, so each open is a
// fresh instance.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, Flame, MapPin, Zap, Clock, X, Minus, Plus, Loader2, Trophy, Star, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { haversineKm, type LatLng } from '@/lib/geo'
import { formatClock, formatPaceLabel, paceFromRun } from '@/lib/run'
import type { RunSaveResponse, BuddiesResponse, HotspotResponse, GroupResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getAvatarColor, getInitials } from './helpers'

const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

type Phase = 'countdown' | 'running' | 'paused' | 'finished'
type Primary = 'time' | 'distance' | 'pace' | 'calories'
interface GpsPoint { lat: number; lng: number; t: number }
interface Candidate { id: string; name: string }

const PRIMARY_ORDER: Primary[] = ['time', 'distance', 'pace', 'calories']

export function RunTracker() {
  const { runContext, closeRunTracker, currentUser, updateProfile } = useRunsembleStore()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<Phase>('countdown')
  const [countdown, setCountdown] = useState(3)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [distanceKm, setDistanceKm] = useState(0)
  const [currentPace, setCurrentPace] = useState(0)
  const [gps, setGps] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable'>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'acquiring' : 'unavailable'
  )
  const [primary, setPrimary] = useState<Primary>('time')
  const [splits, setSplits] = useState<number[]>([])
  const [routePoints, setRoutePoints] = useState<LatLng[]>([])

  // Finish-step state
  const [companions, setCompanions] = useState(0)
  const [buddyIds, setBuddyIds] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [saving, setSaving] = useState(false)

  const phaseRef = useRef<Phase>('countdown')
  const elapsedRef = useRef(0)
  const lastSplitElapsedRef = useRef(0)
  const pointsRef = useRef<GpsPoint[]>([])
  const watchIdRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { elapsedRef.current = elapsedSec }, [elapsedSec])

  // 3-2-1-GO countdown, then start running. All state changes happen inside
  // timeout callbacks (async) so we never setState synchronously in the effect.
  useEffect(() => {
    const timers = [
      setTimeout(() => setCountdown(2), 700),
      setTimeout(() => setCountdown(1), 1400),
      setTimeout(() => setCountdown(0), 2100),
      setTimeout(() => setPhase('running'), 2700),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // 1s ticker — advances only while running.
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (phaseRef.current === 'running') setElapsedSec((s) => s + 1)
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [])

  // GPS watch — accumulate distance from plausible movements, record splits.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps('ok')
        if (phaseRef.current !== 'running') return
        const p: GpsPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() }
        const pts = pointsRef.current
        const last = pts[pts.length - 1]
        if (last) {
          const d = haversineKm({ lat: last.lat, lng: last.lng }, { lat: p.lat, lng: p.lng })
          if (d > 0.003 && d < 0.06) {
            setDistanceKm((prev) => {
              const next = prev + d
              // Record a split each time we cross a whole km.
              if (Math.floor(next) > Math.floor(prev)) {
                const splitTime = elapsedRef.current - lastSplitElapsedRef.current
                lastSplitElapsedRef.current = elapsedRef.current
                setSplits((s) => [...s, splitTime])
              }
              // Rolling current pace over the last ~8 points.
              const window = pts.slice(-8)
              if (window.length >= 2) {
                let wd = 0
                for (let i = 1; i < window.length; i++) wd += haversineKm(window[i - 1], window[i])
                const wt = (p.t - window[0].t) / 1000
                if (wd > 0.01 && wt > 0) setCurrentPace(Math.round(wt / wd))
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
    gps === 'acquiring' ? 'Acquiring GPS…' : gps === 'denied' ? 'Location off — timing only'
    : gps === 'unavailable' ? 'No GPS — timing only' : 'GPS locked'

  const primaryValue = (m: Primary) =>
    m === 'time' ? formatClock(elapsedSec)
    : m === 'distance' ? distanceKm.toFixed(2)
    : m === 'pace' ? formatPaceLabel(currentPace || avgPace).replace(' /km', '')
    : `${calories}`
  const primaryUnit = (m: Primary) => (m === 'time' ? 'time' : m === 'distance' ? 'km' : m === 'pace' ? 'pace /km' : 'kcal')

  return (
    <motion.div
      className="fixed inset-0 z-[1500] flex flex-col text-white"
      style={{ background: 'linear-gradient(160deg, oklch(0.55 0.2 35), oklch(0.42 0.15 30) 60%, oklch(0.28 0.08 40))' }}
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-2">
        <div className="flex items-center gap-2">
          <span className={`relative flex h-2.5 w-2.5 ${phase === 'running' ? '' : 'opacity-50'}`}>
            {phase === 'running' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {phase === 'finished' ? (
          <button onClick={closeRunTracker} className="text-white/70 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        ) : phase !== 'countdown' ? (
          <span className="text-xs font-medium text-white/70 flex items-center gap-1"><MapPin className="h-3 w-3" />{gpsNote}</span>
        ) : null}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'countdown' ? (
          <motion.div key="cd" className="flex-1 flex flex-col items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-white/70 mb-4">{label}</p>
            <motion.p key={countdown} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-8xl font-bold tabular">
              {countdown === 0 ? 'GO' : countdown}
            </motion.p>
          </motion.div>
        ) : phase !== 'finished' ? (
          <motion.div key="live" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex-1 flex flex-col items-center justify-center">
              {/* Tappable primary metric */}
              <button onClick={() => setPrimary((p) => PRIMARY_ORDER[(PRIMARY_ORDER.indexOf(p) + 1) % PRIMARY_ORDER.length])} className="text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-white/60 mb-2">{primaryUnit(primary)}</p>
                <p className="text-7xl font-bold tabular leading-none">{primaryValue(primary)}</p>
                <p className="text-[11px] text-white/40 mt-3">tap to change</p>
              </button>

              {/* Secondary stats */}
              <div className="mt-8 grid grid-cols-3 gap-6 text-center">
                {PRIMARY_ORDER.filter((m) => m !== primary).map((m) => (
                  <div key={m}>
                    <p className="text-2xl font-bold tabular">{primaryValue(m)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-white/60 mt-1">{primaryUnit(m)}</p>
                  </div>
                ))}
              </div>

              {/* Live splits */}
              {splits.length > 0 && (
                <div className="mt-8 w-full max-w-xs">
                  <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1.5 text-center">Splits</p>
                  <div className="flex gap-1 justify-center flex-wrap">
                    {splits.map((s, i) => (
                      <span key={i} className="text-[11px] tabular bg-white/10 rounded px-1.5 py-0.5">{i + 1}k {formatClock(s)}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="px-6 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] flex items-center justify-center gap-6">
              {phase === 'running' ? (
                <button onClick={() => setPhase('paused')} className="h-20 w-20 rounded-full bg-white text-orange-600 flex items-center justify-center shadow-xl active:scale-95 transition-transform" aria-label="Pause">
                  <Pause className="h-8 w-8" fill="currentColor" />
                </button>
              ) : (
                <>
                  <button onClick={() => setPhase('finished')} className="h-16 w-16 rounded-full bg-white/15 border-2 border-white/40 text-white flex items-center justify-center text-xs font-bold active:scale-95 transition-transform">Finish</button>
                  <button onClick={() => setPhase('running')} className="h-20 w-20 rounded-full bg-white text-orange-600 flex items-center justify-center shadow-xl active:scale-95 transition-transform" aria-label="Resume">
                    <Play className="h-8 w-8 ml-1" fill="currentColor" />
                  </button>
                </>
              )}
            </div>
            {phase === 'running' && <p className="text-center text-white/50 text-xs pb-6 -mt-4">Pause to finish your run</p>}
          </motion.div>
        ) : (
          <motion.div key="summary" className="flex-1 flex flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] overflow-y-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mt-2 mb-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto h-14 w-14 rounded-full bg-white/15 flex items-center justify-center mb-2">
                <Trophy className="h-7 w-7" />
              </motion.div>
              <h2 className="text-2xl font-bold">Run complete!</h2>
            </div>

            {/* Route map */}
            {routePoints.length >= 2 && (
              <div className="h-40 rounded-2xl overflow-hidden mb-3 border border-white/20">
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
              <div className="mt-3 rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-semibold mb-2">Splits</p>
                <div className="space-y-1.5">
                  {splits.map((s, i) => {
                    const max = Math.max(...splits)
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-6 text-white/60 tabular">{i + 1}k</span>
                        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-white/70 rounded-full" style={{ width: `${Math.max(15, (s / max) * 100)}%` }} />
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
              <div className="mt-3 rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-semibold mb-2">Rate this run</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
                      <Star className={`h-7 w-7 ${n <= rating ? 'fill-yellow-300 text-yellow-300' : 'text-white/40'}`} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Who did you run with? */}
            <div className="mt-3 rounded-2xl bg-white/10 p-4">
              <p className="text-sm font-semibold">Who did you run with?</p>
              <p className="text-xs text-white/60 mb-3">Tag people to become run buddies (+30 XP each)</p>
              {candidates.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {candidates.map((c) => {
                    const on = buddyIds.includes(c.id)
                    return (
                      <button key={c.id} onClick={() => toggleBuddy(c.id)} className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium transition-colors ${on ? 'bg-white text-orange-600' : 'bg-white/15 text-white'}`}>
                        <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] text-white ${getAvatarColor(c.name)}`}>{getInitials(c.name)}</span>
                        {c.name.split(' ')[0]}
                        {on && <Check className="h-3 w-3" />}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/70">Plus others not on Runsemble</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCompanions((c) => Math.max(0, c - 1))} className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center active:scale-90 transition-transform" aria-label="Fewer"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-5 text-center font-bold tabular">{companions}</span>
                  <button onClick={() => setCompanions((c) => Math.min(50, c + 1))} className="h-7 w-7 rounded-full bg-white/15 flex items-center justify-center active:scale-90 transition-transform" aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>

            {/* Share */}
            <div className="mt-3 rounded-2xl bg-white/10 p-4 flex items-center justify-between">
              <div><p className="text-sm font-semibold">Share to feed</p><p className="text-xs text-white/60">Celebrate with your community</p></div>
              <Switch checked={shareToFeed} onCheckedChange={setShareToFeed} />
            </div>

            <div className="mt-4 space-y-2">
              <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-full bg-white text-orange-600 hover:bg-white/90 font-semibold text-base">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save run
              </Button>
              <Button onClick={closeRunTracker} variant="ghost" disabled={saving} className="w-full h-11 rounded-full text-white/70 hover:text-white hover:bg-white/10">Discard</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function SummaryStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <div className="flex items-center gap-1.5 text-white/60 text-xs mb-1.5">{icon}<span className="uppercase tracking-wider">{label}</span></div>
      <p className="text-xl font-bold tabular">{value}</p>
    </div>
  )
}
