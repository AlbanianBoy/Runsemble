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
import { Pause, Play, Flame, MapPin, Zap, Clock, X, Minus, Plus, Loader2, Trophy, Star, Check, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { haversineKm, ANTWERP_CENTER, type LatLng } from '@/lib/geo'
import { startPositionWatch, drainBufferedLocations, nativeBufferSupported, getFlightLog, isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } from '@/lib/geo-watch'
import { isRunRecorderSupported, startRecording, stopRecording, clearRecording, getTrack as getRecorderTrack, getActiveSession } from '@/lib/run-recorder'
import { Capacitor } from '@capacitor/core'
import { loadActiveRun, saveActiveRun, clearActiveRun, type PersistedRun } from '@/lib/run-persist'
import { queuePendingRun } from '@/lib/run-sync'
import { formatClock, formatPaceLabel, paceFromRun } from '@/lib/run'
import { moveDistanceKm, computeElapsedSec, crossedKm, ACCURACY_GATE_M } from '@/lib/run-math'
import type { RunSaveResponse, BuddiesResponse, HotspotResponse, GroupResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getAvatarColor, getInitials } from './helpers'
import { RunLobby } from './run-lobby'
import { BackgroundPermissionNudge } from './background-permission-nudge'
import { collectTelemetry, type GpsProvider } from '@/lib/run-telemetry'

const LiveRunMap = dynamic(() => import('./live-run-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})
const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

type Phase = 'lobby' | 'ready' | 'running' | 'paused' | 'finished'
interface GpsPoint { lat: number; lng: number; t: number }
interface Candidate { id: string; name: string }

// ─── GPS simulator ───────────────────────────────────────────────────────────
const DEMO_ROUTE: LatLng[] = [
  { lat: 51.2119, lng: 4.4110 }, { lat: 51.2130, lng: 4.4128 }, { lat: 51.2134, lng: 4.4150 },
  { lat: 51.2128, lng: 4.4168 }, { lat: 51.2114, lng: 4.4173 }, { lat: 51.2103, lng: 4.4160 },
  { lat: 51.2098, lng: 4.4140 }, { lat: 51.2104, lng: 4.4120 }, { lat: 51.2119, lng: 4.4110 },
]
const DEMO_SPEED_MPS = 5

function demoPointAt(meters: number): LatLng {
  let total = 0
  const lens: number[] = []
  for (let i = 1; i < DEMO_ROUTE.length; i++) {
    const len = haversineKm(DEMO_ROUTE[i - 1], DEMO_ROUTE[i]) * 1000
    lens.push(len)
    total += len
  }
  let d = total > 0 ? meters % total : 0
  for (let i = 1; i < DEMO_ROUTE.length; i++) {
    const len = lens[i - 1]
    if (d <= len) {
      const t = len === 0 ? 0 : d / len
      const a = DEMO_ROUTE[i - 1]
      const b = DEMO_ROUTE[i]
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
    }
    d -= len
  }
  return DEMO_ROUTE[0]
}

export function RunTracker() {
  const { runContext, closeRunTracker, currentUser, updateProfile } = useRunsembleStore()
  const queryClient = useQueryClient()

  const [restored] = useState<PersistedRun | null>(() =>
    typeof window !== 'undefined' ? loadActiveRun() : null
  )
  const startedAtRef = useRef(restored?.startedAt ?? Date.now())

  const [phase, setPhase] = useState<Phase>(() => {
    if (restored) {
      return Date.now() - restored.updatedAt < 120_000 ? 'running' : 'paused'
    }
    return runContext?.hotspotId || runContext?.groupId ? 'lobby' : 'ready'
  })
  const [runningWith, setRunningWith] = useState<Candidate[]>([])
  const [elapsedSec, setElapsedSec] = useState(() => restored?.elapsedSec ?? 0)
  const [distanceKm, setDistanceKm] = useState(() => restored?.distanceKm ?? 0)
  const [splits, setSplits] = useState<number[]>(() => restored?.splits ?? [])
  const [routePoints, setRoutePoints] = useState<LatLng[]>(() => restored?.routePoints ?? [])
  const [pos, setPos] = useState<LatLng | null>(null)
  const [gps, setGps] = useState<'acquiring' | 'ok' | 'denied' | 'unavailable' | 'demo'>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'acquiring' : 'unavailable'
  )
  const [demo, setDemo] = useState(false)
  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [pointCount, setPointCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const rejectedRef = useRef(0)
  const [isNative] = useState(() => {
    try { return typeof window !== 'undefined' && Capacitor.isNativePlatform() } catch { return false }
  })
  const [voiceOn, setVoiceOn] = useState(true)
  const spokenRef = useRef(0)
  // Track which GPS provider is active for telemetry
  const gpsProviderRef = useRef<GpsProvider>('live')
  // Whether GPS was acquired before the run started
  const [setupComplete, setSetupComplete] = useState(false)

  const clientRunIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  )
  const clientRunId = clientRunIdRef.current

  const [companions, setCompanions] = useState(0)
  const [buddyIds, setBuddyIds] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [shareToFeed, setShareToFeed] = useState(true)
  const [saving, setSaving] = useState(false)

  const phaseRef = useRef<Phase>('ready')
  const elapsedRef = useRef(0)
  const lastSplitElapsedRef = useRef(restored?.lastSplitElapsed ?? 0)
  const pointsRef = useRef<GpsPoint[]>(restored?.points ?? [])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoRef = useRef(false)
  const demoProgressRef = useRef(0)
  const ingestRef = useRef<(lat: number, lng: number, accuracy: number | null, t: number) => void>(() => {})
  const seenTimesRef = useRef<Set<number>>(new Set())
  const bufferSupportedRef = useRef(false)
  const recorderSupportedRef = useRef(false)
  const recorderActiveRef = useRef(false)
  const recorderIndexRef = useRef(0)
  const elapsedBaseRef = useRef(restored?.elapsedSec ?? 0)
  const runningSinceRef = useRef<number | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { elapsedRef.current = elapsedSec }, [elapsedSec])
  useEffect(() => { demoRef.current = demo }, [demo])

  useEffect(() => {
    if (phase === 'running') {
      if (runningSinceRef.current == null) runningSinceRef.current = Date.now()
    } else if (runningSinceRef.current != null) {
      elapsedBaseRef.current += (Date.now() - runningSinceRef.current) / 1000
      runningSinceRef.current = null
    }
  }, [phase])

  const syncElapsed = useCallback(() => {
    if (phaseRef.current !== 'running' || runningSinceRef.current == null) return
    setElapsedSec(computeElapsedSec(elapsedBaseRef.current, runningSinceRef.current, Date.now()))
  }, [])
  useEffect(() => {
    tickRef.current = setInterval(syncElapsed, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') syncElapsed() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncElapsed])

  const ingestPosition = (lat: number, lng: number, accuracy: number | null, t: number) => {
    const now = t || Date.now()
    const p: GpsPoint = { lat, lng, t: now }
    setPos({ lat, lng })
    if (accuracy != null) setAccuracyM(accuracy)
    if (phaseRef.current !== 'running') return

    if (seenTimesRef.current.has(now)) return
    seenTimesRef.current.add(now)

    if (accuracy != null && accuracy > ACCURACY_GATE_M) {
      rejectedRef.current += 1
      setRejectedCount(rejectedRef.current)
      return
    }

    const pts = pointsRef.current
    const last = pts[pts.length - 1]
    if (last) {
      const d = moveDistanceKm({ lat: last.lat, lng: last.lng }, { lat, lng }, accuracy, now - last.t)
      if (d > 0) {
        setDistanceKm((prev) => {
          const next = prev + d
          if (crossedKm(prev, next)) {
            const splitTime = elapsedRef.current - lastSplitElapsedRef.current
            lastSplitElapsedRef.current = elapsedRef.current
            setSplits((s) => [...s, splitTime])
          }
          return next
        })
        setRoutePoints((rp) => [...rp, { lat, lng }])
      }
    }
    pts.push(p)
    setPointCount(pts.length)
  }
  useEffect(() => { ingestRef.current = ingestPosition })

  useEffect(() => {
    if (phase === 'running' || phase === 'paused') {
      saveActiveRun({
        startedAt: startedAtRef.current,
        updatedAt: Date.now(),
        elapsedSec: elapsedRef.current,
        distanceKm,
        splits,
        routePoints,
        points: pointsRef.current,
        lastSplitElapsed: lastSplitElapsedRef.current,
        context: runContext ?? null,
      })
    } else if (phase === 'finished') {
      clearActiveRun()
    }
  }, [phase, routePoints, splits, distanceKm, runContext])

  useEffect(() => {
    return startPositionWatch({
      onPosition: (lat, lng, accuracy, t) => {
        if (demoRef.current) return
        setGps((prev) => {
          // Mark setup complete once GPS is first acquired
          if (prev === 'acquiring') setSetupComplete(true)
          return 'ok'
        })
        if (bufferSupportedRef.current) {
          setPos({ lat, lng })
          if (accuracy != null) setAccuracyM(accuracy)
        } else {
          ingestRef.current(lat, lng, accuracy, t)
        }
      },
      onError: (kind) => setGps(kind),
    })
  }, [])

  // Phase 2 cold-launch recovery
  useEffect(() => {
    let cancelled = false
    async function reattachIfNeeded() {
      // isRunRecorderSupported() is synchronous — no await needed
      const hasRecorder = isRunRecorderSupported()
      if (cancelled || !hasRecorder) return
      recorderSupportedRef.current = true
      bufferSupportedRef.current = true
      gpsProviderRef.current = 'recorder'

      const session = await getActiveSession()
      if (cancelled || !session.active || !session.runId) return

      clientRunIdRef.current = session.runId

      const { points, nextIndex } = await getRecorderTrack(session.runId, 0)
      if (cancelled) return

      seenTimesRef.current.clear()
      pointsRef.current = []

      for (const p of points) {
        ingestRef.current(p.lat, p.lng, p.acc ?? null, p.t)
      }
      recorderIndexRef.current = nextIndex
      recorderActiveRef.current = true

      if (session.startedAt) {
        startedAtRef.current = session.startedAt
        elapsedBaseRef.current = Math.max(0, (Date.now() - session.startedAt) / 1000)
        runningSinceRef.current = Date.now()
        setElapsedSec(Math.max(0, Math.floor(elapsedBaseRef.current)))
      }

      setPhase('running')
    }
    void reattachIfNeeded()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Buffer / recorder drain
  useEffect(() => {
    let cancelled = false
    for (const p of pointsRef.current) seenTimesRef.current.add(p.t)
    const drain = async () => {
      if (cancelled) return
      if (recorderSupportedRef.current) {
        if (!recorderActiveRef.current || phaseRef.current !== 'running') return
        const { points, nextIndex } = await getRecorderTrack(clientRunIdRef.current, recorderIndexRef.current)
        recorderIndexRef.current = nextIndex
        if (cancelled || phaseRef.current !== 'running') return
        for (const p of points) ingestRef.current(p.lat, p.lng, p.acc, p.t)
        return
      }
      if (!bufferSupportedRef.current) return
      const fixes = await drainBufferedLocations()
      if (cancelled || phaseRef.current !== 'running') return
      for (const f of fixes) ingestRef.current(f.lat, f.lng, f.accuracy, f.t)
    }

    // isRunRecorderSupported() is synchronous
    const hasRecorder = isRunRecorderSupported()
    if (hasRecorder) {
      recorderSupportedRef.current = true
      bufferSupportedRef.current = true
      gpsProviderRef.current = 'recorder'
      void drain()
    } else {
      void nativeBufferSupported().then((ok) => {
        if (cancelled) return
        bufferSupportedRef.current = ok
        if (ok) {
          gpsProviderRef.current = 'buffer'
          void drain()
        }
      })
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void drain() }
    const onFocus = () => void drain()
    const iv = setInterval(() => void drain(), 2000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (!isNative) return
    void (async () => {
      if (!(await isIgnoringBatteryOptimizations())) {
        await requestIgnoreBatteryOptimizations()
      }
    })()
  }, [isNative])

  useEffect(() => {
    if (phase === 'finished' && recorderActiveRef.current) {
      const runId = clientRunIdRef.current
      recorderActiveRef.current = false
      void stopRecording().then(() => clearRecording(runId))
    }
  }, [phase])

  useEffect(() => {
    if (splits.length === 0 || splits.length <= spokenRef.current) return
    spokenRef.current = splits.length
    if (!voiceOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const s = splits[splits.length - 1]
    const mins = Math.floor(s / 60)
    const secs = Math.round(s % 60)
    const u = new SpeechSynthesisUtterance(
      `Kilometer ${splits.length}. ${mins} ${mins === 1 ? 'minute' : 'minutes'} ${secs} seconds.`
    )
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  }, [splits, voiceOn])

  useEffect(() => {
    if (!demo) return
    gpsProviderRef.current = 'demo'
    demoProgressRef.current = 0
    const t0 = setTimeout(() => ingestRef.current(DEMO_ROUTE[0].lat, DEMO_ROUTE[0].lng, 5, Date.now()), 0)
    const iv = setInterval(() => {
      if (phaseRef.current === 'running') demoProgressRef.current += DEMO_SPEED_MPS
      const p = demoPointAt(demoProgressRef.current)
      ingestRef.current(p.lat, p.lng, 5, Date.now())
    }, 1000)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, [demo])

  const fallbackCenter: LatLng =
    currentUser?.lat != null && currentUser?.lng != null
      ? { lat: currentUser.lat, lng: currentUser.lng }
      : ANTWERP_CENTER

  const beginNativeRecorder = () => {
    if (!recorderSupportedRef.current) return
    recorderActiveRef.current = true
    recorderIndexRef.current = 0
    void startRecording(clientRunIdRef.current)
  }

  const startRun = () => {
    seenTimesRef.current.clear()
    rejectedRef.current = 0
    setRejectedCount(0)
    void drainBufferedLocations()
    beginNativeRecorder()
    if (pos) {
      pointsRef.current = [{ lat: pos.lat, lng: pos.lng, t: Date.now() }]
      setRoutePoints([pos])
    }
    setPhase('running')
  }

  const handleLobbyStart = (others: Candidate[]) => {
    if (phaseRef.current !== 'lobby') return
    setRunningWith(others)
    setBuddyIds(others.map((o) => o.id))
    seenTimesRef.current.clear()
    rejectedRef.current = 0
    setRejectedCount(0)
    void drainBufferedLocations()
    beginNativeRecorder()
    if (pos) {
      pointsRef.current = [{ lat: pos.lat, lng: pos.lng, t: Date.now() }]
      setRoutePoints([pos])
    }
    setPhase('running')
    toast.success(others.length > 0 ? `Run started — you're off with ${others.length} other${others.length > 1 ? 's' : ''}! 🏃` : 'Run started — go! 🏃')
  }

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
    const peopleAdded = buddyIds.length + companions

    // Collect telemetry — never blocks save, falls back to null
    const telemetry = await collectTelemetry({
      pointCount,
      rejectedCount,
      gpsProvider: gpsProviderRef.current,
      elapsedSec,
      setupComplete,
    }).catch(() => null)

    const payload = {
      clientRunId: clientRunIdRef.current,
      distanceKm: +distanceKm.toFixed(3),
      durationSec: elapsedSec,
      hotspotId: runContext?.hotspotId ?? null,
      groupId: runContext?.groupId ?? null,
      companions,
      buddyIds,
      path: pointsRef.current.filter((_, i) => i % 3 === 0).map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) })),
      splits,
      rating: rating || null,
      shareToFeed,
      telemetry,
    }
    try {
      const res = await apiSend<RunSaveResponse>('/api/runs', 'POST', { userId: currentUser.id, ...payload })

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
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError
      if (offline) {
        queuePendingRun({ ...payload, queuedAt: Date.now() })
        updateProfile({
          totalRuns: currentUser.totalRuns + 1,
          totalDistanceKm: +(currentUser.totalDistanceKm + distanceKm).toFixed(2),
          totalPeopleRunWith: currentUser.totalPeopleRunWith + peopleAdded,
        })
        toast.success("Saved on your phone — it'll upload when you're back online 📶")
        closeRunTracker()
        return
      }
      toast.error(e instanceof Error ? e.message : 'Failed to save run')
      setSaving(false)
    }
  }, [currentUser, distanceKm, elapsedSec, runContext, companions, buddyIds, splits, rating, shareToFeed, updateProfile, queryClient, closeRunTracker, pointCount, rejectedCount, setupComplete])

  const label = runContext?.label ?? 'Solo run'
  const flightPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyFlightLog = useCallback(async () => {
    const logText = await getFlightLog()
    if (!logText) { toast('No flight log yet'); return }
    try {
      await navigator.clipboard.writeText(logText)
      const lines = logText.trim().split('\n').filter(Boolean).length
      toast.success(`Flight log copied (${lines} events) — paste it to Claude`)
    } catch {
      toast.error('Could not copy flight log')
    }
  }, [])
  const startFlightPress = () => {
    flightPressRef.current = setTimeout(() => { void copyFlightLog() }, 600)
  }
  const cancelFlightPress = () => {
    if (flightPressRef.current) { clearTimeout(flightPressRef.current); flightPressRef.current = null }
  }

  const accSuffix = gps === 'ok' && accuracyM != null ? ` ±${Math.round(accuracyM)}m` : ''
  const modeSuffix = gps === 'ok' || gps === 'acquiring' ? (isNative ? ' · native' : ' · web') : ''
  const rejSuffix = rejectedCount > 0 ? ` +${rejectedCount}rej` : ''
  const ptsSuffix = (phase === 'running' || phase === 'paused') ? ` · ${pointCount}pts${rejSuffix}` : ''
  const weakGps = gps === 'ok' && accuracyM != null && accuracyM > ACCURACY_GATE_M
  const gpsNote =
    gps === 'acquiring' ? 'Acquiring GPS…' : gps === 'denied' ? 'Location off'
    : gps === 'unavailable' ? 'No GPS' : gps === 'demo' ? 'Demo GPS'
    : `GPS${accSuffix}${modeSuffix}${ptsSuffix}`

  return (
    <motion.div
      className="fixed inset-0 z-[1500] flex flex-col bg-background text-foreground"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
    >
      {phase === 'lobby' && (runContext?.hotspotId || runContext?.groupId) ? (
        <RunLobby
          hotspotId={runContext.hotspotId}
          groupId={runContext.groupId}
          pos={pos}
          onClose={closeRunTracker}
          onStarted={handleLobbyStart}
        />
      ) : phase !== 'finished' ? (
        <>
          <div className="relative flex-1 min-h-0">
            <LiveRunMap center={fallbackCenter} current={pos} path={routePoints} />

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
                <span
                  className="glass rounded-full px-3 py-1.5 text-[11px] font-medium border shadow-sm flex items-center gap-1.5 select-none"
                  onPointerDown={startFlightPress}
                  onPointerUp={cancelFlightPress}
                  onPointerLeave={cancelFlightPress}
                  onPointerCancel={cancelFlightPress}
                >
                  <span className={`h-2 w-2 rounded-full ${weakGps ? 'bg-amber-500' : gps === 'ok' ? 'bg-emerald-500' : gps === 'demo' ? 'bg-violet-500' : gps === 'acquiring' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                  {gpsNote}
                </span>
                {phase !== 'ready' && (
                  <button
                    onClick={() => setVoiceOn((v) => !v)}
                    className="glass h-8 w-8 rounded-full border shadow-sm flex items-center justify-center"
                    aria-label={voiceOn ? 'Mute voice cues' : 'Unmute voice cues'}
                  >
                    {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}
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

            {runningWith.length > 0 && (
              <div className="absolute top-[calc(env(safe-area-inset-top,0px)+3.1rem)] left-3 z-[600] pointer-events-none">
                <span className="glass border shadow-sm rounded-full pl-1.5 pr-3 py-1 flex items-center gap-2 text-[11px] font-medium">
                  <span className="flex -space-x-1.5">
                    {runningWith.slice(0, 3).map((r) => (
                      <span
                        key={r.id}
                        className={`h-5 w-5 rounded-full border-2 border-background flex items-center justify-center text-[8px] text-white ${getAvatarColor(r.name)}`}
                      >
                        {getInitials(r.name)}
                      </span>
                    ))}
                  </span>
                  Running with {runningWith[0].name.split(' ')[0]}
                  {runningWith.length > 1 ? ` +${runningWith.length - 1}` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="border-t bg-background px-6 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">
            {phase === 'ready' ? (
              <div className="flex flex-col items-center gap-4">
                <BackgroundPermissionNudge />
                <p className="text-sm text-muted-foreground text-center">
                  {gps === 'ok'
                    ? 'GPS locked — ready when you are.'
                    : gps === 'demo'
                    ? 'Demo GPS active — START and watch a simulated run.'
                    : gps === 'acquiring'
                    ? 'Getting a GPS fix… you can start anyway.'
                    : 'No GPS here — your time will still be tracked.'}
                </p>
                <button
                  onClick={startRun}
                  className="h-20 w-20 rounded-full bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-lg shadow-teal-500/40 active:scale-95 transition-transform"
                >
                  START
                </button>
                {gps !== 'ok' && !demo && (
                  <button
                    onClick={() => { setDemo(true); setGps('demo') }}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                    or simulate a run (demo mode)
                  </button>
                )}
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
                {weakGps && phase === 'running' && (
                  <p className="mt-3 text-center text-[11px] text-amber-600 dark:text-amber-500">
                    Weak GPS signal — distance resumes once it sharpens
                  </p>
                )}
                <div className="mt-4 flex items-center justify-center gap-5">
                  {phase === 'running' ? (
                    <button
                      onClick={() => setPhase('paused')}
                      className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-teal-500/30 active:scale-95 transition-transform"
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
                        className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-teal-500/30 active:scale-95 transition-transform"
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
 