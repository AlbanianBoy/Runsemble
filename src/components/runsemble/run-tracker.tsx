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
import { isRunRecorderSupported, startRecording, stopRecording, getTrack as getRecorderTrack, getActiveSession } from '@/lib/run-recorder'
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
// distance, pace, splits) be demoed indoors — research interviews, desktops —
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
  const [gps, setGps] = useState<'acquiring' | 'ok' | 'denied' | 