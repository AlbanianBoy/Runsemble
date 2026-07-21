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
// Phase 2: native disk-first recorder. Preferred over the community-plugin buffer
// when the installed native build has it; falls back gracefully otherwise.
import { isRunRecorderSupported, startRecording, stopRecording, clearRecording, getTrack as getRecorderTrack, getActiveSession } from '@/lib/run-recorder'
import { Capacitor } from '@capacitor/core'
import { loadActiveRun, saveActiveRun, clearActiveRun, type PersistedRun } from '@/lib/run-persist'
import { queuePendingRun } from '@/lib/run-sync'
import { track } from '@/lib/analytics'
import { formatClock, formatPaceLabel, paceFromRun } from '@/lib/run'
import { moveDistanceKm, computeElapsedSec, crossedKm, ACCURACY_GATE_M } from '@/lib/run-math'
import type { RunSaveResponse, BuddiesResponse, HotspotResponse, GroupResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getAvatarColor, getInitials } from './helpers'
import { RunLobby } from './run-lobby'
import { BackgroundPermissionNudge } from './background-permission-nudge'

const LiveRunMap = dynamic(() => import('./live-run-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})
const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

type Phase = 'lobby' | 'ready' | 'running' | 'paused' | 'finished'
interface GpsPoint { lat: number; lng: number; t: number }
interface Candidate { id: string; name: string }

// ─── GPS simulator ───────────────────────────────────────────────────────────
// A loop around Stadspark, Antwerp. Lets the full tracking experience (trail,
// distance, pace, and splits) be demoed indoors — research interviews, desktops —
// where there's no GPS. Clearly labelled "Demo GPS" in the UI.
const DEMO_ROUTE: LatLng[] = [
  { lat: 51.2119, lng: 4.4110 }, { lat: 51.2130, lng: 4.4128 }, { lat: 51.2134, lng: 4.4150 },
  { lat: 51.2128, lng: 4.4168 }, { lat: 51.2114, lng: 4.4173 }, { lat: 51.2103, lng: 4.4160 },
  { lat: 51.2098, lng: 4.4140 }, { lat: 51.2104, lng: 4.4120 }, { lat: 51.2119, lng: 4.4110 },
]
const DEMO_SPEED_MPS = 5 // ~3:20/km — brisk, so the demo moves visibly

/** Point `meters` along the demo loop (wraps around). */
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

  // Crash recovery: if a run was interrupted (app killed mid-run), pick it back
  // up from the copy we persist to the device as it records.
  const [restored] = useState<PersistedRun | null>(() =>
    typeof window !== 'undefined' ? loadActiveRun() : null
  )
  const startedAtRef = useRef(restored?.startedAt ?? Date.now())

  // Hotspot AND group runs open in the lobby — you gather, check in, and start
  // together. Only solo runs go straight to the ready screen.
  const [phase, setPhase] = useState<Phase>(() => {
    if (restored) {
      // A very recent snapshot means the app dropped mid-run — resume tracking
      // straight away (the runner isn't looking at the phone). An older snapshot
      // is a recovered run the user should confirm, so keep it paused.
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
  // Count of GPS points recorded this run. A live diagnostic: if this keeps
  // climbing during a screen-off walk, the plugin is delivering background points
  // (distance/route will reconstruct); if it's stuck, the WebView was frozen.
  const [pointCount, setPointCount] = useState(0)
  // How many fixes this run were dropped for poor accuracy. A live diagnostic:
  // if the route is sparse and this is high, the accuracy gate is too strict for
  // the current signal (e.g. phone in a pocket); if it's ~0, fixes just aren't
  // being collected. Shown on the GPS chip as "+Nrej".
  const [rejectedCount, setRejectedCount] = useState(0)
  const rejectedRef = useRef(0)
  // Whether we're in the native app (real background GPS) or the browser
  // (foreground-only). Shown on the GPS chip so we can tell them apart on-device.
  const [isNative] = useState(() => {
    try { return Capacitor.isNativePlatform() } catch { return false }
  })
  const [voiceOn, setVoiceOn] = useState(true)
  const spokenRef = useRef(0)

  // A stable id for this run — promoted to a ref so the native session's runId
  // can be adopted during cold-launch reattach (see effect below). All
  // getTrack / startRecording / handleSave calls use clientRunIdRef.current.
  const clientRunIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  )
  const clientRunId = clientRunIdRef.current

  // Finish-step state
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
  // Dedup GPS fixes by their fix time. A fix can reach us via both the live
  // callback and the native buffer drain during the brief startup window before
  // we know which path owns distance — count each fix exactly once.
  const seenTimesRef = useRef<Set<number>>(new Set())
  // True once we've confirmed the installed native app has the buffering patch.
  // Until then (and on the plain web) the live callback feeds distance, so an old
  // native build still tracks — it just can't recover screen-off points.
  const bufferSupportedRef = useRef(false)
  // Phase 2: native disk-first RunRecorder. When present it REPLACES the community
  // buffer as the distance/route source — we poll its durable on-disk track by line
  // index. Gated on support so an old native build (or web) keeps the buffer path.
  const recorderSupportedRef = useRef(false)
  const recorderActiveRef = useRef(false)
  const recorderIndexRef = useRef(0)
  // Wall-clock timer state: elapsed = base + (now - runningSince). Computed from
  // real timestamps so a WebView frozen in the background catches up on resume,
  // instead of under-counting because the 1s tick stopped firing.
  const elapsedBaseRef = useRef(restored?.elapsedSec ?? 0)
  const runningSinceRef = useRef<number | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { elapsedRef.current = elapsedSec }, [elapsedSec])
  useEffect(() => { demoRef.current = demo }, [demo])

  // Advance/hold the wall-clock timer as the run starts, pauses, resumes.
  useEffect(() => {
    if (phase === 'running') {
      if (runningSinceRef.current == null) runningSinceRef.current = Date.now()
    } else if (runningSinceRef.current != null) {
      elapsedBaseRef.current += (Date.now() - runningSinceRef.current) / 1000
      runningSinceRef.current = null
    }
  }, [phase])

  // Recompute elapsed from the wall clock every second AND whenever we return to
  // the foreground. Missed ticks (a WebView frozen in the background) don't
  // matter — the next recompute snaps the timer to the true elapsed time.
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

  // One ingestion path for real GPS *and* the simulator: update the position,
  // and while running, accumulate distance/route/splits with a jitter filter.
  const ingestPosition = (lat: number, lng: number, accuracy: number | null, t: number) => {
    const now = t || Date.now() // real GPS fix time (matters for buffered points)
    const p: GpsPoint = { lat, lng, t: now }
    setPos({ lat, lng })
    if (accuracy != null) setAccuracyM(accuracy)
    if (phaseRef.current !== 'running') return

    // Count each fix once, whichever path delivered it (live callback vs buffer drain).
    if (seenTimesRef.current.has(now)) return
    seenTimesRef.current.add(now)

    // Reject readings too uncertain to trust. Indoors / urban canyons the fix
    // drifts tens of metres while you stand still; counting those piles up fake
    // distance (a run "moving" while you sit). Only points within the accuracy
    // gate contribute to distance and the route — the rest are counted as a
    // diagnostic so we can tell "too strict" from "no signal".
    if (accuracy != null && accuracy > ACCURACY_GATE_M) {
      rejectedRef.current += 1
      setRejectedCount(rejectedRef.current)
      return
    }

    const pts = pointsRef.current
    const last = pts[pts.length - 1]
    if (last) {
      // Distance this move contributes, or 0 if rejected (too inaccurate, sub-step
      // jitter, or an implausible jump for the time gap). The speed-aware cap in
      // run-math lets buffered background points — far apart in distance AND time —
      // reconstruct the real route instead of being dropped as "teleports".
      const d = moveDistanceKm({ lat: last.lat, lng: last.lng }, { lat, lng }, accuracy, now - last.t)
      if (d > 0) {
        setDistanceKm((prev) => {
          const next = prev + d
          // Record a split each time we cross a whole km.
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

  // Persist the in-progress run to the device so an app-kill mid-run doesn't
  // lose it (recovered on next open via `restored`). Cleared once finished.
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

  // GPS watch — position updates always (so the ready screen shows where you
  // are). On the web this is the browser Geolocation API; in the native app it's
  // the background-geolocation plugin, so a run keeps recording with the screen
  // off. Updates are ignored while the simulator drives the position.
  //
  // When the native buffer is available, distance/route come *only* from draining
  // that buffer (the effect below) — the live callback just moves the marker. That
  // keeps the fix stream in true time order and avoids a straight-line jump on
  // resume. On the web (or an un-patched native build) the live callback feeds
  // distance directly, exactly as before.
  useEffect(() => {
    return startPositionWatch({
      onPosition: (lat, lng, accuracy, t) => {
        if (demoRef.current) return
        setGps('ok')
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

  // Phase 2 cold-launch recovery: if a native RunRecorder session is active
  // (e.g. the user backgrounded mid-run and reopened the app), reattach to it
  // and replay the full disk track before rendering running state.
  useEffect(() => {
    let cancelled = false
    async function reattachIfNeeded() {
      // isRunRecorderSupported() is sync — no await needed.
      const hasRecorder = isRunRecorderSupported()
      if (cancelled || !hasRecorder) return
      recorderSupportedRef.current = true
      bufferSupportedRef.current = true

      const session = await getActiveSession()
      if (cancelled || !session.active || !session.runId) return

      // Adopt the native session's runId so all subsequent getTrack / stopRecording
      // calls reference the same durable session.
      clientRunIdRef.current = session.runId

      // Replay the entire persisted track from disk.
      const { points, nextIndex } = await getRecorderTrack(session.runId, 0)
      if (cancelled) return

      seenTimesRef.current.clear()
      pointsRef.current = []

      for (const p of points) {
        ingestRef.current(p.lat, p.lng, p.acc ?? null, p.t)
      }
      recorderIndexRef.current = nextIndex
      recorderActiveRef.current = true

      // Restore elapsed time from the native session's startedAt.
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
  }, [])

  // Pull collected fixes into the run whenever the app is awake. Two possible
  // native sources, in order of preference:
  //   1. RunRecorder (Phase 2): a started foreground service that writes every fix
  //      to disk. We poll its durable track by line index — so fixes collected
  //      while the WebView was frozen/backgrounded are read back from DISK on
  //      resume, and survive even an app kill. This is the authoritative source.
  //   2. Community-plugin buffer (Phase 1): in-memory native buffer, drained here.
  // On web / an old native build neither is present and the live callback (in the
  // watch effect above) feeds distance directly.
  useEffect(() => {
    let cancelled = false
    // A recovered run already holds its earlier fixes; don't recount them.
    for (const p of pointsRef.current) seenTimesRef.current.add(p.t)
    const drain = async () => {
      if (cancelled) return
      if (recorderSupportedRef.current) {
        if (!recorderActiveRef.current || phaseRef.current !== 'running') return
        const { points, nextIndex } = await getRecorderTrack(clientRunIdRef.current, recorderIndexRef.current)
        recorderIndexRef.current = nextIndex
        if (cancelled || phaseRef.current !== 'running') return
        for (const p of points) ingestRef.current(p.lat, p.lng, p.acc ?? null, p.t)
        return
      }
      if (!bufferSupportedRef.current) return
      const fixes = await drainBufferedLocations()
      // Only accumulate while actually running; drop fixes gathered during a pause.
      if (cancelled || phaseRef.current !== 'running') return
      for (const f of fixes) ingestRef.current(f.lat, f.lng, f.accuracy, f.t)
    }

    // isRunRecorderSupported() is sync — use a plain if instead of .then() to
    // avoid a TypeError crash (calling .then() on a boolean throws immediately).
    void (async () => {
      if (cancelled) return
      if (isRunRecorderSupported()) {
        recorderSupportedRef.current = true
        bufferSupportedRef.current = true
        void drain()
        return
      }
      const ok = await nativeBufferSupported()
      if (cancelled) return
      bufferSupportedRef.current = ok
      if (ok) void drain()
    })()

    const onVisible = () => { if (document.visibilityState === 'visible') void drain() }
    const onFocus = () => void drain()
    // While awake, this is also what advances distance/route (the buffer is the
    // source of truth on native), so keep it brisk for a smooth on-screen readout.
    // It can't catch points mid-freeze — the resume events below do that.
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

  // On native, make sure we're on the OS battery-optimization whitelist — the
  // exemption Samsung's screen-off freezer actually respects (and which its
  // "Never sleeping apps" picker won't let you set manually once an app is already
  // "Unrestricted"). Pops the one-tap system dialog once, only if not already set.
  useEffect(() => {
    if (!isNative) return
    void (async () => {
      if (!(await isIgnoringBatteryOptimizations())) {
        await requestIgnoreBatteryOptimizations()
      }
    })()
  }, [isNative])

  // Stop the native disk recorder when the run finishes or is explicitly discarded.
  // Clear the on-disk track immediately after stopping so JSONL files don't
  // accumulate on internal storage — one run, one write cycle.
  // NOT on unmount — swiping the app away must not terminate the native service.
  useEffect(() => {
    if (phase === 'finished' && recorderActiveRef.current) {
      const runId = clientRunIdRef.current
      recorderActiveRef.current = false
      void stopRecording().then(() => clearRecording(runId))
    }
  }, [phase])

  // Audio pace cues — announce each completed kilometre, Nike Run Club style.
  // Speech is an external system, so driving it from an effect is the right shape.
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

  // GPS simulator — advances along the demo loop while running, so trail,
  // distance, pace, and splits all behave exactly like a real run.
  useEffect(() => {
    if (!demo) return
    demoProgressRef.current = 0
    const t0 = setTimeout(() => ingestRef.current(DEMO_ROUTE[0].lat, DEMO_ROUTE[0].lng, 5, Date.now()), 0)
    const iv = setInterval(() => {
      if (phaseRef.current === 'running') demoProgressRef.current += DEMO_SPEED_MPS
      const p = demoPointAt(demoProgressRef.current)
      ingestRef.current(p.lat, p.lng, 5, Date.now())
    }, 1000)
    return () => { clearTimeout(t0); clearInterval(iv) }
  }, [demo])

  // Where the map focuses before GPS locks: your saved coords, else city centre.
  const fallbackCenter: LatLng =
    currentUser?.lat != null && currentUser?.lng != null
      ? { lat: currentUser.lat, lng: currentUser.lng }
      : ANTWERP_CENTER

  // Start the native disk recorder for this run (no-op unless it's present).
  const beginNativeRecorder = () => {
    if (!recorderSupportedRef.current) return
    recorderActiveRef.current = true
    recorderIndexRef.current = 0
    void startRecording(clientRunIdRef.current)
  }

  const startRun = () => {
    // Drop any fixes the watcher buffered before the run began, and reset dedup,
    // so distance starts clean from the seed point below.
    seenTimesRef.current.clear()
    rejectedRef.current = 0
    setRejectedCount(0)
    void drainBufferedLocations()
    beginNativeRecorder()
    // Seed the route with the current fix so the start point is marked
    // immediately — "where you started", Strava-style.
    if (pos) {
      pointsRef.current = [{ lat: pos.lat, lng: pos.lng, t: Date.now() }]
      setRoutePoints([pos])
    }
    setPhase('running')
  }

  // The lobby says go — start recording with the group on screen. The people
  // who were checked in become the pre-filled buddy tags at the finish.
  const handleLobbyStart = (others: Candidate[]) => {
    if (phaseRef.current !== 'lobby') return // guard against double-fire (own tap + poll)
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
    const peopleAdded = buddyIds.length + companions
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
    }
    try {
      const res = await apiSend<RunSaveResponse>('/api/runs', 'POST', { userId: currentUser.id, ...payload })

      // The headline question analytics exists to answer: does anyone finish a run?
      track('run_saved', { distanceKm, durationSec: elapsedSec, shared: shareToFeed, withOthers: peopleAdded })

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
      // Say when the rest day was spent. A streak that silently survives a
      // missed day teaches nothing; naming it teaches the actual rule, at the
      // one moment the person is looking.
      if (res.streak.usedGrace) toast(`🔥 Streak kept at ${res.streak.streak} — rest day forgiven`)
      res.badgesEarned.forEach((b) => toast(`${b.icon} Badge unlocked: ${b.title}`))

      closeRunTracker()
    } catch (e) {
      // No signal to reach the server? Don't lose the run. Stash it on the device
      // and let RunSyncRegister upload it when the connection is back — the
      // clientRunId keeps that upload idempotent. A real server error (while
      // online) is shown so the runner can retry.
      const offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || e instanceof TypeError
      if (offline) {
        queuePendingRun({ ...payload, queuedAt: Date.now() })
        // Optimistically move the profile so it feels saved; the server reconciles
        // exact XP/streak on the next load once the queued run uploads.
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
  }, [currentUser, distanceKm, elapsedSec, runContext, companions, buddyIds, splits, rating, shareToFeed, updateProfile, queryClient, closeRunTracker])

  const label = runContext?.label ?? 'Solo run'
  // Long-press the GPS chip to copy the native flight recorder to the clipboard —
  // a diagnostic hook so a screen-off walk can be pasted back for analysis without
  // adb. No-op on web / un-patched builds (empty log).
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

  // Live accuracy + which GPS engine is driving (native background service vs
  // the browser's foreground-only geolocation) — surfaced so weak signal and a
  // web fallback are visible on the phone instead of silent.
  const accSuffix = gps === 'ok' && accuracyM != null ? ` ±${Math.round(accuracyM)}m` : ''
  const modeSuffix = gps === 'ok' || gps === 'acquiring' ? (isNative ? ' · native' : ' · web') : ''
  // Live point count during a run — the diagnostic for background delivery: if it
  // keeps climbing while the screen is off, the plugin is feeding us points.
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
                <span
                  className="glass rounded-full px-3 py-1.5 text-[11px] font-medium border shadow-sm flex items-center gap-1.5 select-none"
                  onPointerDown={startFlightPress}
                  onPointerUp={cancelFlightPress}
                  onPointerLeave={cancelFlightPress}
                  onPointerCancel={cancelFlightPress}
                >
                  <span className={`h-2 w-2 rounded-full ${weakGps ? 'bg-amber-500' : gps === 'ok' ? 'bg-emerald-500' : gps === 'demo' ? 'bg-sky-500' : gps === 'acquiring' ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
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

            {/* Running-with strip — the group is visible the whole run */}
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

          {/* Stats + record controls */}
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
              <Button
                onClick={() => {
                  if (recorderActiveRef.current) {
                    const runId = clientRunIdRef.current
                    recorderActiveRef.current = false
                    void stopRecording().then(() => clearRecording(runId))
                  }
                  closeRunTracker()
                }}
                variant="ghost"
                disabled={saving}
                className="w-full h-11 rounded-full text-muted-foreground"
              >
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
