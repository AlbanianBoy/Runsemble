'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, MapPin, Users, Navigation, Loader2, Map as MapIcon, Flame, Play, MessageCircle, Search, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { track } from '@/lib/analytics'
import { ANTWERP_CENTER, haversineKm, distanceLabel, type LatLng } from '@/lib/geo'
import { isAvailableNow, isComingUp, availableFromLabel, AVAILABLE_NOW_MINUTES } from '@/lib/availability'
import { readPosition } from '@/lib/use-location-refresh'
import type {
  ApiHotspot,
  ApiUser,
  HotspotsResponse,
  HotspotResponse,
  UsersResponse,
} from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { getAvatarColor, getInitials, AudienceBadge } from './helpers'
import { HotspotsTab } from './hotspots-tab'
import { ReportSheet } from './report-sheet'

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
  const [reportOpen, setReportOpen] = useState(false)
  const [view, setView] = useState<'map' | 'runs'>('map')
  const [paceFilter, setPaceFilter] = useState<PaceFilter>('any')
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [availSheetOpen, setAvailSheetOpen] = useState(false)
  const [laterTime, setLaterTime] = useState(() => {
    const d = new Date(Date.now() + 90 * 60_000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const queryClient = useQueryClient()

  const { data: hotspotsData } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  const { data: usersData } = useQuery({
    // Position is part of the key: move city and the neighbourhood you're asking
    // about changes, so the cached answer for the old one is not the answer.
    queryKey: ['users', currentUser?.id, currentUser?.lat, currentUser?.lng],
    queryFn: () => {
      // Scope discovery to the area around the viewer. Without this the endpoint
      // hands every visible user's location cell to anyone logged in, which is
      // the privacy leak — the client-side radius chips only ever hid rows the
      // browser had already been given. The server default radius (25km) is far
      // wider than the widest chip (5km), so the filters still work untouched.
      const { lat, lng } = currentUser ?? {}
      const scope = lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ''
      return apiGet<UsersResponse>(`/api/users?viewerId=${currentUser?.id ?? ''}${scope}`)
    },
  })

  const hotspots = hotspotsData?.hotspots ?? []
  const users = usersData?.users ?? []

  // ── Run invites ──
  const { data: invitesData } = useQuery({
    queryKey: ['invites'],
    queryFn: () =>
      apiGet<{ received: Array<{ id: string; message: string | null; sender: { id: string; name: string; avatar: string | null; paceLevel: string; city: string } }> }>('/api/invites'),
    enabled: !!currentUser?.id,
  })
  const receivedInvites = invitesData?.received ?? []
  const inviteMutation = useMutation({
    mutationFn: (recipientId: string) => apiSend('/api/invites', 'POST', { recipientId }),
    onSuccess: () => toast.success('Run invite sent 🏃'),
    onError: (e: Error) => toast.error(e.message),
  })
  const answerInvite = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      apiSend(`/api/invites/${id}`, 'PATCH', { action }),
    onSuccess: (_data, v) => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      if (v.action === 'accept') toast.success('Accepted! Message them to plan it 🤝')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Find people by name ──
  const [search, setSearch] = useState('')
  const searchQ = search.trim()
  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['user-search', searchQ],
    queryFn: () => apiGet<UsersResponse>(`/api/users/search?q=${encodeURIComponent(searchQ)}`),
    enabled: searchQ.length >= 2,
  })
  const searchResults = searchQ.length >= 2 ? searchData?.users ?? [] : []

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

  // Runners live on the map right now (explicitly available OR their scheduled
  // slot has started), visible, located, not me, matching the filters.
  const availableRunners = useMemo(
    () =>
      users
        .filter(
          (u) =>
            isAvailableNow(u) &&
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

  // Runners free later today — the reason to plan instead of hoping.
  const comingUp = useMemo(
    () =>
      users
        .filter((u) => u.id !== myId && u.privacyVisible && isComingUp(u))
        .sort(
          (a, b) =>
            new Date(a.availableFrom!).getTime() - new Date(b.availableFrom!).getTime()
        )
        .slice(0, 4),
    [users, myId]
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

  // ── Availability: now, later today, or off ─────────────────────────────────
  const myScheduled =
    currentUser?.availableFrom && new Date(currentUser.availableFrom).getTime() > Date.now()
      ? new Date(currentUser.availableFrom)
      : null

  const goAvailableNow = () => {
    track('went_available')
    setAvailability(true, AVAILABLE_NOW_MINUTES)
    updateProfile({ isAvailable: true, availableFrom: null })
    if (currentUser?.id) {
      const userId = currentUser.id
      // Going available means "I'm here and free to run now", so where you are is
      // the whole point. Without this you could go available carrying whatever
      // position you signed up with — or none at all, in which case the map's
      // `u.lat != null` filter hid you completely: available and invisible.
      //
      // This is also the one moment where asking for location is expected rather
      // than an ambush, so allowPrompt is true here and nowhere else.
      void (async () => {
        const coords = await readPosition({ allowPrompt: true })
        await apiSend(`/api/users/${userId}`, 'PUT', {
          isAvailable: true,
          availableFrom: null,
          availableUntil: new Date(Date.now() + AVAILABLE_NOW_MINUTES * 60_000).toISOString(),
          // Only send coordinates we actually got — never null them out, or a
          // refused prompt would erase a position we already had.
          ...(coords ?? {}),
        }).catch(() => {})
        if (coords) updateProfile(coords)
      })()
    }
    setAvailSheetOpen(false)
  }

  const stopAvailability = () => {
    setAvailability(false)
    updateProfile({ isAvailable: false, availableFrom: null })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: false }).catch(() => {})
    }
    setAvailSheetOpen(false)
  }

  const scheduleLater = () => {
    const [h, m] = laterTime.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return
    const when = new Date()
    when.setHours(h, m, 0, 0)
    if (when.getTime() <= Date.now()) {
      toast.error('Pick a time later today')
      return
    }
    setAvailability(false)
    updateProfile({ isAvailable: false, availableFrom: when.toISOString() })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', {
        isAvailable: false,
        availableFrom: when.toISOString(),
      }).catch(() => {})
    }
    setAvailSheetOpen(false)
    toast.success(`You're on the map for ${laterTime} — runners nearby will see you coming up`)
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

      {/* Run invites waiting for you */}
      {receivedInvites.length > 0 && (
        <div className="mb-2 space-y-2">
          {receivedInvites.map((inv) => (
            <div key={inv.id} className="rounded-2xl border bg-card p-3 flex items-center gap-3">
              <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(inv.sender.name)}`}>{getInitials(inv.sender.name)}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate"><span className="font-semibold">{inv.sender.name.split(' ')[0]}</span> invited you to run 🏃</p>
                {inv.message && <p className="text-xs text-muted-foreground truncate">&ldquo;{inv.message}&rdquo;</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="rounded-full h-8 px-3" disabled={answerInvite.isPending} onClick={() => answerInvite.mutate({ id: inv.id, action: 'decline' })}>Decline</Button>
                <Button size="sm" className="rounded-full h-8 px-3" disabled={answerInvite.isPending} onClick={() => answerInvite.mutate({ id: inv.id, action: 'accept' })}>Accept</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Find people by name */}
      <div className="relative mb-2">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search runners by name…" className="rounded-full pl-9" />
      </div>
      {searchQ.length >= 2 && (
        <div className="mb-2 rounded-2xl border bg-card divide-y overflow-hidden">
          {searching && searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Searching…</p>
          ) : searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No runners found for &ldquo;{searchQ}&rdquo;</p>
          ) : (
            searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelectedRunner(u); setSearch('') }}
                className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(u.name)}`}>{getInitials(u.name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.city} · {u.paceLevel}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>
      )}

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

      {/* dvh (not vh) so the mobile browser's collapsing toolbar is accounted
          for, plus the bottom safe-area inset so the availability toggle and
          nearby cards clear the home indicator / bottom nav on notched phones. */}
      <div className="relative h-[calc(100dvh-232px-env(safe-area-inset-bottom))]">
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

      {/* Coming up — who's free later today */}
      {comingUp.length > 0 && (
        <div className="absolute top-3 left-3 right-3 z-[500]">
          <div className="glass rounded-full px-3 py-1.5 text-[11px] font-medium shadow-sm border border-border/50 inline-flex items-center gap-1.5 max-w-full">
            <Clock className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">
              Coming up:{' '}
              {comingUp
                .map((u) => `${u.name.split(' ')[0]} ${availableFromLabel(u.availableFrom!)}`)
                .join(' · ')}
            </span>
          </div>
        </div>
      )}

      {/* The core loop, always in reach: who's free to run right now, and a
          one-tap switch to say you are too. Sits over the bottom of the map like
          a transit or ride-hail app rather than a single floating button. */}
      <div className="absolute inset-x-2 bottom-3 z-[500]">
        <div className="glass rounded-2xl border border-border/50 shadow-lg p-3">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <p className="text-sm font-bold">
              {availableRunners.length > 0
                ? `${availableRunners.length} free to run now`
                : 'No one free right now'}
            </p>
            <Button
              size="sm"
              className={`rounded-full font-semibold shrink-0 ${
                isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-primary hover:bg-primary/90'
              }`}
              onClick={() => (isAvailable ? stopAvailability() : setAvailSheetOpen(true))}
            >
              <Navigation className={`h-4 w-4 mr-1.5 ${isAvailable ? 'animate-pulse' : ''}`} />
              {isAvailable ? 'Available' : myScheduled ? 'Free later' : "I'm free"}
            </Button>
          </div>

          {availableRunners.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5">
              {availableRunners.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRunner(r)}
                  className="shrink-0 w-[128px] rounded-xl border border-border/60 bg-card/80 p-2.5 text-left hover:bg-card active:scale-[0.98] transition-all"
                >
                  <Avatar className="h-9 w-9 mb-1.5">
                    <AvatarFallback className={`text-xs text-white ${getAvatarColor(r.name)}`}>
                      {getInitials(r.name)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-semibold truncate">{r.name.split(' ')[0]}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{r.paceLevel}</p>
                  <p className="text-[11px] text-primary font-medium mt-0.5 tabular-nums">
                    {distanceLabel(haversineKm(me, { lat: r.lat!, lng: r.lng! }))}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tap <span className="font-medium text-foreground">I&rsquo;m free</span> and anyone nearby
              who&rsquo;s also up for a run will see you here.
            </p>
          )}
        </div>
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
                {isComingUp(selectedRunner) && (
                  <p className="text-xs font-semibold text-primary mt-1">
                    \uD83D\uDD52 Free to run at {availableFromLabel(selectedRunner.availableFrom!)}
                  </p>
                )}
              </div>
              {selectedRunner.bio && <p className="text-sm">{selectedRunner.bio}</p>}
              <div className="flex justify-center gap-4 text-sm">
                <div className="text-center"><p className="font-bold">{selectedRunner.totalRuns}</p><p className="text-xs text-muted-foreground">runs</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.totalPeopleRunWith}</p><p className="text-xs text-muted-foreground">run buddies</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.streak}</p><p className="text-xs text-muted-foreground">streak</p></div>
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 rounded-full font-semibold"
                  onClick={() => {
                    const r = selectedRunner
                    setSelectedRunner(null)
                    openDm({ id: r.id, name: r.name })
                  }}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />Message
                </Button>
                <Button
                  className="flex-1 rounded-full font-semibold"
                  disabled={inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate(selectedRunner.id)}
                >
                  <Play className="h-4 w-4 mr-2" fill="currentColor" />Invite to run
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                {'\u{1F512}'} Location shown approximately for privacy
              </p>
              <button
                onClick={() => setReportOpen(true)}
                className="text-[11px] text-muted-foreground/70 hover:text-destructive transition-colors"
              >
                Report &amp; block
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Categorised report for the selected runner. Filing implies a block —
          the block protects the user now, the reason tells an operator what to
          look for. */}
      <ReportSheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        subjectType="user"
        subjectId={selectedRunner?.id ?? null}
        subjectLabel={selectedRunner?.name}
        onReported={() => {
          const r = selectedRunner
          if (!r || !currentUser?.id) return
          apiSend(`/api/users/${r.id}/block`, 'POST', { blockerId: currentUser.id, reason: 'reported' })
            .then(() => {
              toast.success(`${r.name} blocked`)
              queryClient.invalidateQueries({ queryKey: ['users'] })
              setSelectedRunner(null)
            })
            .catch(() => toast.error('Reported, but could not block — try again from their profile'))
        }}
      />

      {/* When are you free? */}
      <Sheet open={availSheetOpen} onOpenChange={setAvailSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <div className="p-4 space-y-4">
            <SheetHeader>
              <SheetTitle>When are you free to run?</SheetTitle>
              <SheetDescription>
                Nearby runners see you on the map and can plan around you.
              </SheetDescription>
            </SheetHeader>
            <Button className="w-full h-12 rounded-full font-semibold" onClick={goAvailableNow}>
              <Navigation className="h-4 w-4 mr-2" />
              Now — visible for {AVAILABLE_NOW_MINUTES} min
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={laterTime}
                onChange={(e) => setLaterTime(e.target.value)}
                className="flex-1"
                aria-label="Free later today at"
              />
              <Button variant="outline" className="rounded-full px-5" onClick={scheduleLater}>
                Set for later
              </Button>
            </div>
            {myScheduled && (
              <button
                onClick={stopAvailability}
                className="block w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Remove my {availableFromLabel(myScheduled.toISOString())} slot
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
      </div>
    </div>
  )
}
