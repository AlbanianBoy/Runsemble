'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, MapPin, Users, Navigation, Loader2, Map as MapIcon, Flame, Play, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { ANTWERP_CENTER, haversineKm, distanceLabel, type LatLng } from '@/lib/geo'
import type {
  ApiHotspot,
  ApiUser,
  HotspotsResponse,
  HotspotResponse,
  UsersResponse,
} from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { getAvatarColor, getInitials, AudienceBadge } from './helpers'
import { HotspotsTab } from './hotspots-tab'

// Leaflet must never render on the server — load the canvas client-side only.
const MapCanvas = dynamic(() => import('./map-canvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-2xl" />,
})

type PaceFilter = 'any' | 'beginner' | 'intermediate' | 'advanced'

const PACE_OPTIONS: { id: PaceFilter; label: string }[] = [
  { id: 'any', label: 'Any pace' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const RADIUS_OPTIONS: { v: number | null; label: string }[] = [
  { v: null, label: 'Anywhere' },
  { v: 1, label: '< 1 km' },
  { v: 3, label: '< 3 km' },
  { v: 5, label: '< 5 km' },
]

export function MapTab() {
  const { currentUser, isAvailable, setAvailability, updateProfile, openRunTracker, openDm } = useRunsembleStore()
  const [selectedHotspot, setSelectedHotspot] = useState<ApiHotspot | null>(null)
  const [selectedRunner, setSelectedRunner] = useState<ApiUser | null>(null)
  const [view, setView] = useState<'map' | 'runs'>('map')
  const [paceFilter, setPaceFilter] = useState<PaceFilter>('any')
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: hotspotsData } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  const { data: usersData } = useQuery({
    queryKey: ['users', currentUser?.id],
    queryFn: () => apiGet<UsersResponse>(`/api/users?viewerId=${currentUser?.id ?? ''}`),
  })

  const hotspots = hotspotsData?.hotspots ?? []
  const users = usersData?.users ?? []

  // Stable primitives so the memo dependencies match exactly what's read
  // (keeps the React Compiler's manual-memoization check happy).
  const myId = currentUser?.id
  const myLat = currentUser?.lat ?? null
  const myLng = currentUser?.lng ?? null

  // Where "I" am. Use my stored coordinates, else fall back to the city centre.
  const me: LatLng = useMemo(
    () => (myLat != null && myLng != null ? { lat: myLat, lng: myLng } : ANTWERP_CENTER),
    [myLat, myLng]
  )

  // Runners who are available, visible, located, not me, and match the active
  // pace/distance filters — sorted by distance.
  const availableRunners = useMemo(
    () =>
      users
        .filter(
          (u) =>
            u.isAvailable &&
            u.privacyVisible &&
            u.lat != null &&
            u.lng != null &&
            u.id !== myId &&
            (paceFilter === 'any' || u.paceLevel === 'any' || u.paceLevel === paceFilter) &&
            (radiusKm == null || haversineKm(me, { lat: u.lat, lng: u.lng }) <= radiusKm)
        )
        .sort(
          (a, b) =>
            haversineKm(me, { lat: a.lat!, lng: a.lng! }) -
            haversineKm(me, { lat: b.lat!, lng: b.lng! })
        ),
    [users, myId, me, paceFilter, radiusKm]
  )

  // Hotspot pins that match the same filters.
  const visibleHotspots = useMemo(
    () =>
      hotspots.filter(
        (h) =>
          (paceFilter === 'any' || h.paceRange === 'any' || h.paceRange === paceFilter) &&
          (radiusKm == null || haversineKm(me, { lat: h.lat, lng: h.lng }) <= radiusKm)
      ),
    [hotspots, paceFilter, radiusKm, me]
  )

  const joinMutation = useMutation({
    mutationFn: (id: string) =>
      apiSend<HotspotResponse>(`/api/hotspots/${id}/join`, 'POST', { userId: currentUser?.id }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] })
      if (data.xp) {
        updateProfile({ xp: data.xp.newXp })
        if (data.xp.rankedUp) {
          toast.success(`Rank up! You're now ${data.xp.rankAfter} ${'\u{1F389}'}`)
        } else {
          toast.success(`+${data.xp.awarded} XP for joining`)
        }
      }
      if (data.badgeEarned) {
        toast(`${data.badgeEarned.icon} Badge unlocked: ${data.badgeEarned.title}`)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleAvailability = () => {
    const next = !isAvailable
    setAvailability(next, 45)
    updateProfile({ isAvailable: next })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: next }).catch(() => {})
    }
  }

  const isLoading = !hotspotsData && !usersData

  const runnerDistance =
    selectedRunner?.lat != null && selectedRunner?.lng != null
      ? distanceLabel(haversineKm(me, { lat: selectedRunner.lat, lng: selectedRunner.lng }))
      : null

  // Segmented Map / Runs toggle — the Runs timeline used to be its own tab.
  const toggle = (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-muted mb-3">
      {([
        { id: 'map', label: 'Map', icon: MapIcon },
        { id: 'runs', label: 'Runs', icon: Flame },
      ] as const).map((opt) => {
        const Icon = opt.icon
        const active = view === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => setView(opt.id)}
            className={`relative flex items-center justify-center gap-1.5 rounded-full py-1.5 text-sm font-medium transition-colors ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}
          >
            {active && <motion.span layoutId="map-toggle" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
            <span className="relative z-10 flex items-center gap-1.5"><Icon className="h-4 w-4" />{opt.label}</span>
          </button>
        )
      })}
    </div>
  )

  if (view === 'runs') {
    return (
      <div>
        {toggle}
        <HotspotsTab />
      </div>
    )
  }

  return (
    <div>
      {toggle}

      {/* Pace + distance filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {PACE_OPTIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPaceFilter(p.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              paceFilter === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="h-4 w-px bg-border shrink-0 mx-0.5" />
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r.label}
            onClick={() => setRadiusKm(r.v)}
            className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              radiusKm === r.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="relative h-[calc(100vh-232px)]">
      <div className="rs-map-wrap absolute inset-0 overflow-hidden rounded-2xl border border-border/60 shadow-sm">
        {isLoading && <Skeleton className="absolute inset-0 z-[600] h-full w-full rounded-2xl" />}
        <MapCanvas
          hotspots={visibleHotspots}
          runners={availableRunners}
          me={me}
          myName={currentUser?.name ?? 'You'}
          available={isAvailable}
          onSelectHotspot={setSelectedHotspot}
          onSelectRunner={setSelectedRunner}
        />
      </div>

      {/* Nearby count chip */}
      <div className="absolute top-3 left-3 z-[500] glass rounded-full px-3 py-1.5 text-xs font-medium shadow-sm border border-border/50">
        {availableRunners.length > 0
          ? `${availableRunners.length} runner${availableRunners.length === 1 ? '' : 's'} nearby`
          : 'No runners nearby yet'}
      </div>

      {/* Availability toggle */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
        <Button
          size="lg"
          className={`rounded-full shadow-xl font-semibold px-6 ${
            isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-primary hover:bg-primary/90'
          }`}
          onClick={toggleAvailability}
        >
          <Navigation className={`h-4 w-4 mr-2 ${isAvailable ? 'animate-pulse' : ''}`} />
          {isAvailable ? 'Available · tap to stop' : "I'm free to run"}
        </Button>
      </div>

      {/* Hotspot detail sheet */}
      <Sheet open={!!selectedHotspot} onOpenChange={() => setSelectedHotspot(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {selectedHotspot && (
            <div className="p-4 space-y-4">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  {selectedHotspot.name}
                  <AudienceBadge audience={selectedHotspot.audience} />
                </SheetTitle>
                <SheetDescription>
                  {selectedHotspot.location}
                  {selectedHotspot.scheduleLabel ? ` · ${selectedHotspot.scheduleLabel}` : ''}
                </SheetDescription>
              </SheetHeader>
              <div className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{selectedHotspot.minutesUntil} min</span>
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{selectedHotspot.distanceKm}km</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{selectedHotspot.participantCount} joined</span>
              </div>
              {selectedHotspot.description && <p className="text-sm">{selectedHotspot.description}</p>}
              {selectedHotspot.participantNames?.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {selectedHotspot.participantNames.slice(0, 5).map((name, i) => (
                      <Avatar key={i} className="w-7 h-7 border-2 border-background">
                        <AvatarFallback className={`text-[9px] text-white ${getAvatarColor(name)}`}>{getInitials(name)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{selectedHotspot.participantNames.join(', ')}</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 rounded-full font-semibold"
                  variant="outline"
                  disabled={joinMutation.isPending}
                  onClick={() => {
                    joinMutation.mutate(selectedHotspot.id)
                    setSelectedHotspot(null)
                  }}
                >
                  {joinMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Join
                </Button>
                <Button
                  className="flex-1 rounded-full font-semibold"
                  onClick={() => {
                    const hs = selectedHotspot
                    setSelectedHotspot(null)
                    openRunTracker({ hotspotId: hs.id, label: hs.name })
                  }}
                >
                  <Play className="h-4 w-4 mr-2" fill="currentColor" />
                  Start run
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Runner profile sheet */}
      <Sheet open={!!selectedRunner} onOpenChange={() => setSelectedRunner(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {selectedRunner && (
            <div className="p-4 space-y-3 text-center">
              <Avatar className="h-16 w-16 mx-auto">
                <AvatarFallback className={`text-lg text-white ${getAvatarColor(selectedRunner.name)}`}>{getInitials(selectedRunner.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-lg">{selectedRunner.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedRunner.city} &middot; {selectedRunner.paceLevel}
                  {runnerDistance ? ` \u00B7 ${runnerDistance}` : ''}
                </p>
              </div>
              {selectedRunner.bio && <p className="text-sm">{selectedRunner.bio}</p>}
              <div className="flex justify-center gap-4 text-sm">
                <div className="text-center"><p className="font-bold">{selectedRunner.totalRuns}</p><p className="text-xs text-muted-foreground">runs</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.totalPeopleRunWith}</p><p className="text-xs text-muted-foreground">run buddies</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.streak}</p><p className="text-xs text-muted-foreground">streak</p></div>
              </div>
              <Button
                className="w-full rounded-full font-semibold"
                onClick={() => {
                  const r = selectedRunner
                  setSelectedRunner(null)
                  openDm({ id: r.id, name: r.name })
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />Message
              </Button>
              <p className="text-[11px] text-muted-foreground pt-1">
                {'\u{1F512}'} Location shown approximately for privacy
              </p>
              <button
                onClick={() => {
                  const r = selectedRunner
                  if (!currentUser?.id) return
                  if (!confirm(`Report & block ${r.name}? You won't see each other or be able to message.`)) return
                  apiSend(`/api/users/${r.id}/block`, 'POST', { blockerId: currentUser.id, reason: 'reported from profile' })
                    .then(() => {
                      toast.success(`${r.name} blocked`)
                      queryClient.invalidateQueries({ queryKey: ['users'] })
                      setSelectedRunner(null)
                    })
                    .catch(() => toast.error('Could not block'))
                }}
                className="text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors"
              >
                Report &amp; block
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      </div>
    </div>
  )
}
