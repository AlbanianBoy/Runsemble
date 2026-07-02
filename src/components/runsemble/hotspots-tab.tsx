'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, MapPin, Users, ChevronDown, ChevronUp, Flame, Plus, Loader2, Play, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { ApiHotspot, HotspotsResponse, HotspotResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getAvatarColor, getInitials, AudienceBadge } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

function getDefaultStartTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

interface FormData {
  name: string
  description: string
  location: string
  sportType: 'running' | 'trail' | 'walking'
  distanceKm: number
  paceRange: 'any' | 'beginner' | 'intermediate' | 'advanced'
  audience: 'all' | 'women' | 'beginner'
  startTime: string
}

const INITIAL_FORM: FormData = {
  name: '',
  description: '',
  location: '',
  sportType: 'running',
  distanceKm: 5,
  paceRange: 'any',
  audience: 'all',
  startTime: '',
}

export function HotspotsTab() {
  const { currentUser, updateProfile, openRunTracker } = useRunsembleStore()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormData>(() => ({ ...INITIAL_FORM, startTime: getDefaultStartTime() }))
  const queryClient = useQueryClient()

  const openCreateDialog = useCallback(() => {
    setForm({ ...INITIAL_FORM, startTime: getDefaultStartTime() })
    setDialogOpen(true)
  }, [])

  const { data: hotspotsData, isLoading } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })

  const hotspots: ApiHotspot[] = hotspotsData?.hotspots ?? []

  const joinMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      action === 'join'
        ? apiSend<HotspotResponse>(`/api/hotspots/${id}/join`, 'POST', { userId: currentUser?.id })
        : apiSend<HotspotResponse>(`/api/hotspots/${id}/join?userId=${currentUser?.id}`, 'DELETE'),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] })
      if (vars.action === 'join' && data.xp) {
        updateProfile({ xp: data.xp.newXp })
        if (data.xp.rankedUp) {
          toast.success(`Rank up! You're now ${data.xp.rankAfter} ${'\u{1F389}'}`)
        } else {
          toast.success(`+${data.xp.awarded} XP for joining`)
        }
        if (data.badgeEarned) {
          toast(`${data.badgeEarned.icon} Badge unlocked: ${data.badgeEarned.title}`)
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) =>
      apiSend<HotspotResponse>('/api/hotspots', 'POST', {
        ...data,
        lat: currentUser?.lat ?? 51.2194, // creator's position, else Antwerp centre
        lng: currentUser?.lng ?? 4.4025,
        recurringIntervalMin: 30,
        createdBy: currentUser?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotspots'] })
      setDialogOpen(false)
    },
  })

  const isSubmitting = createMutation.isPending
  const formValid = useMemo(
    () => form.name.trim() !== '' && form.location.trim() !== '' && form.startTime !== '',
    [form.name, form.location, form.startTime]
  )

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formValid || isSubmitting) return
    createMutation.mutate(form)
  }

  if (isLoading) return (
    <div className="space-y-3">{[1,2,3].map(i => (<Card key={i}><CardContent className="p-4"><div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full rounded-lg" /></div></CardContent></Card>))}</div>
  )

  return (
    <div className="relative">
      <div className="space-y-3 pb-24">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold">Upcoming Runs</h2>
          <Badge variant="secondary" className="text-xs">{hotspots?.length || 0} available</Badge>
        </div>
        {hotspots.length === 0 && !isLoading && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Flame className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            No upcoming runs right now. Create one!
          </CardContent></Card>
        )}
        {hotspots.map((h) => {
          const isJoined = h.participants?.some((p) => p.userId === currentUser?.id)
          return (
          <motion.div key={h.id} {...fadeUp}>
            <Card className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${h.minutesUntil < 30 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                        {h.minutesUntil <= 0 ? 'Starting!' : `in ${h.minutesUntil} min`}
                      </span>
                      <span className="text-xs text-muted-foreground">{h.distanceKm}km</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm">{h.name}</h3>
                      {h.isOfficial && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary" title="Official Runsemble city spot">
                          <BadgeCheck className="h-3.5 w-3.5" />Official
                        </span>
                      )}
                      <AudienceBadge audience={h.audience} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3" />{h.location}
                    </div>
                    {h.scheduleLabel && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />{h.scheduleLabel}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button
                      size="sm"
                      variant={isJoined ? 'secondary' : 'default'}
                      onClick={() => joinMutation.mutate({ id: h.id, action: isJoined ? 'leave' : 'join' })}
                    >
                      {isJoined ? 'Joined' : 'Join'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-primary"
                      onClick={() => openRunTracker({ hotspotId: h.id, label: h.name })}
                    >
                      <Play className="h-3 w-3 mr-1" fill="currentColor" />Start
                    </Button>
                  </div>
                </div>

                {/* Participants preview */}
                {h.participantNames?.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex -space-x-2">
                      {h.participantNames.slice(0, 4).map((name: string, i: number) => (
                        <Avatar key={i} className="w-6 h-6 border-2 border-background"><AvatarFallback className={`text-[8px] text-white ${getAvatarColor(name)}`}>{getInitials(name)}</AvatarFallback></Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">{h.participantCount} {h.participantCount === 1 ? 'person' : 'people'} joining</span>
                  </div>
                )}

                {/* Expandable description */}
                {h.description && (
                  <>
                    <button onClick={() => setExpanded(expanded === h.id ? null : h.id)} className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors">
                      {expanded === h.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {expanded === h.id ? 'Less' : 'More details'}
                    </button>
                    {expanded === h.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 text-sm text-muted-foreground">
                        {h.description}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />Pace: {h.paceRange}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Every {h.recurringIntervalMin} min</span>
                        </div>
                      </motion.div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
          )
        })}
      </div>

      {/* ── FAB ── */}
      <motion.button
        onClick={openCreateDialog}
        className="fixed bottom-24 right-4 sm:bottom-20 sm:right-6 z-40 w-14 h-14 rounded-full gradient-brand text-white shadow-lg shadow-orange-400/30 flex items-center justify-center"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Create a new run"
      >
        <Plus className="h-6 w-6" />
      </motion.button>

      {/* ── Create Hotspot Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create a Run</DialogTitle>
            <DialogDescription>
              Organise a group run and let others join you.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-name">Run name *</Label>
              <Input
                id="hs-name"
                placeholder="Morning Loop in the Park"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-desc">Description</Label>
              <Textarea
                id="hs-desc"
                placeholder="Casual pace, all welcome…"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={2}
              />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-loc">Location *</Label>
              <Input
                id="hs-loc"
                placeholder="Stadspark, Antwerp"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                required
              />
            </div>

            {/* Sport type */}
            <div className="space-y-2">
              <Label>Sport type</Label>
              <RadioGroup
                value={form.sportType}
                onValueChange={(v) => updateField('sportType', v as FormData['sportType'])}
                className="grid grid-cols-3 gap-2"
              >
                {(['running', 'trail', 'walking'] as const).map((sport) => (
                  <label
                    key={sport}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      form.sportType === sport
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    <RadioGroupItem value={sport} className="sr-only" />
                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Distance */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-dist">Distance (km)</Label>
              <Input
                id="hs-dist"
                type="number"
                min={0.5}
                step={0.5}
                value={form.distanceKm}
                onChange={(e) => updateField('distanceKm', Math.max(0.5, Number(e.target.value)))}
              />
            </div>

            {/* Pace range */}
            <div className="space-y-1.5">
              <Label>Pace range</Label>
              <Select
                value={form.paceRange}
                onValueChange={(v) => updateField('paceRange', v as FormData['paceRange'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select pace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any pace</SelectItem>
                  <SelectItem value="beginner">Beginner (6:00+ /km)</SelectItem>
                  <SelectItem value="intermediate">Intermediate (5:00–6:00 /km)</SelectItem>
                  <SelectItem value="advanced">Advanced (&lt;5:00 /km)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Who's it for */}
            <div className="space-y-1.5">
              <Label>Who&apos;s it for?</Label>
              <Select
                value={form.audience}
                onValueChange={(v) => updateField('audience', v as FormData['audience'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Everyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone welcome</SelectItem>
                  <SelectItem value="women">Women only</SelectItem>
                  <SelectItem value="beginner">Beginners</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start time */}
            <div className="space-y-1.5">
              <Label htmlFor="hs-time">Start time *</Label>
              <Input
                id="hs-time"
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => updateField('startTime', e.target.value)}
                required
              />
            </div>

            {/* Error feedback */}
            <AnimatePresence>
              {createMutation.isError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-destructive"
                >
                  {createMutation.error?.message || 'Something went wrong. Please try again.'}
                </motion.p>
              )}
            </AnimatePresence>

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="gradient-brand border-0 text-white hover:opacity-90"
                disabled={!formValid || isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Run
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}