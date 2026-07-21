'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Users, Flame, Pencil, Loader2, Check, MapPin, Route, ChevronRight, Target, Download, LogOut, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore, getRankFromXP, type PaceLevel } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { AVAILABLE_NOW_MINUTES } from '@/lib/availability'
import type { BadgesResponse } from '@/lib/types'
import { Leaderboard } from './leaderboard'
import { RunHistory } from './run-history'
import { ThemeToggle } from './theme-toggle'
import { SafeZonesCard } from './safe-zones-card'
import { Switch } from '@/components/ui/switch'
import { ChallengesView } from './challenges-view'
import { BuddiesView } from './buddies-view'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

const SCHEDULE_OPTIONS = [
  { value: 'morning', label: 'Morning', desc: 'Early bird runs' },
  { value: 'afternoon', label: 'Afternoon', desc: 'Midday energy' },
  { value: 'evening', label: 'Evening', desc: 'Sunset sessions' },
] as const

// Mirrors GENDERS in lib/enums, plus an explicit "prefer not to say" (empty
// value → stored as null). Labels are the founder's to refine.
const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: '', label: 'Prefer not to say' },
] as const

export function ProfileTab() {
  const { currentUser, updateProfile, profileView, setProfileView } = useRunsembleStore()
  const queryClient = useQueryClient()

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editPaceLevel, setEditPaceLevel] = useState<PaceLevel>('beginner')
  const [editSchedule, setEditSchedule] = useState<string[]>([])
  const [editGender, setEditGender] = useState<string>('') // '' = prefer not to say

  // Availability — derived from store
  const isAvailable = currentUser?.isAvailable ?? false
  const [availableMinutesLeft, setAvailableMinutesLeft] = useState(45)
  const availTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (availTimerRef.current) clearInterval(availTimerRef.current) }
  }, [])

  const { data: badgesData, isLoading: badgesLoading } = useQuery({
    queryKey: ['badges', currentUser?.id],
    queryFn: () => apiGet<BadgesResponse>(`/api/badges?userId=${currentUser?.id}`),
    enabled: !!currentUser?.id,
  })

  const badges = badgesData?.badges ?? []

  // PUT mutation for profile updates
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/users/${currentUser?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['badges', currentUser?.id] })
    },
  })

  // Availability callbacks (after mutation to avoid "used before declared")
  const startAvailability = useCallback(async () => {
    setAvailableMinutesLeft(45)
    // Stamp the expiry the map already uses. Without it the server row has no
    // end time, so to other people this "free to run now" pin never goes stale —
    // the 45-min timer below only clears local state, not the server.
    const availableUntil = new Date(Date.now() + AVAILABLE_NOW_MINUTES * 60_000).toISOString()
    updateProfile({ isAvailable: true, availableUntil })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: true, availableUntil }).catch(() => {})
    }
    if (availTimerRef.current) clearInterval(availTimerRef.current)
    availTimerRef.current = setInterval(() => {
      setAvailableMinutesLeft(prev => {
        if (prev <= 1) {
          if (availTimerRef.current) clearInterval(availTimerRef.current)
          updateProfile({ isAvailable: false })
          return 45
        }
        return prev - 1
      })
    }, 60000)
  }, [updateProfile, currentUser])

  const stopAvailability = useCallback(() => {
    if (availTimerRef.current) { clearInterval(availTimerRef.current); availTimerRef.current = null }
    setAvailableMinutesLeft(45)
    updateProfile({ isAvailable: false, availableUntil: null })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: false, availableUntil: null }).catch(() => {})
    }
  }, [updateProfile, currentUser])

  const openEditDialog = () => {
    if (!currentUser) return
    setEditName(currentUser.name)
    setEditBio(currentUser.bio || '')
    setEditCity(currentUser.city)
    setEditPaceLevel(currentUser.paceLevel)
    // schedulePreference may be typed narrowly in the store — cast to unknown
    // first so TypeScript accepts the typeof / Array.isArray narrowing below.
    const stored = currentUser.schedulePreference as unknown
    const parsed = Array.isArray(stored)
      ? (stored as string[])
      : typeof stored === 'string' && stored.length > 0
        ? stored.split(',')
        : []
    setEditSchedule(parsed)
    setEditGender(currentUser.gender ?? '')
    setEditOpen(true)
  }

  const toggleScheduleSlot = (slot: string) => {
    setEditSchedule(prev =>
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
    )
  }

  const handleSaveProfile = async () => {
    const trimmedName = editName.trim()
    if (!trimmedName) return

    const updates = {
      name: trimmedName,
      bio: editBio.trim() || null,
      city: editCity.trim() || 'Antwerp',
      paceLevel: editPaceLevel,
      // Empty select = prefer not to say → null. Only a valid gender is sent.
      gender: editGender || null,
      // DB column is String — persist as comma-separated
      schedulePreference: editSchedule.join(','),
    }

    updateMutation.mutate(updates, {
      onSuccess: () => {
        updateProfile({ ...updates, schedulePreference: editSchedule as never })
        setEditOpen(false)
      },
    })
  }

  const toggleAvailability = () => {
    if (!currentUser) return
    if (isAvailable) {
      stopAvailability()
    } else {
      startAvailability()
    }
  }

  // ── Account & data (GDPR) ──────────────────────────────────────────────────
  const handleExportData = async () => {
    if (!currentUser) return
    try {
      const res = await fetch('/api/auth/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'runsemble-data.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Could not export your data right now — try again in a moment.')
    }
  }

  const handleInviteFriend = async () => {
    const url = 'https://runsemble.net'
    const text = 'Come run with me on Runsemble — find runners near you and never run alone. Because together is better. 🏃'
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Runsemble', text, url })
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        toast.success('Invite copied — paste it to a friend!')
      }
    } catch {
      // share sheet dismissed — nothing to do
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('runsemble-store')
    location.reload()
  }

  const handleDeleteAccount = async () => {
    if (!currentUser) return
    if (!confirm('Delete your account and ALL your data (runs, posts, messages, buddies)? This cannot be undone.')) return
    const res = await fetch('/api/auth/account', { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      alert('Could not delete your account right now — try again in a moment.')
      return
    }
    localStorage.removeItem('runsemble-store')
    location.reload()
  }

  if (!currentUser) return <Skeleton className="h-64 w-full rounded-xl" />

  // Sub-views reachable from the profile.
  if (profileView === 'leaderboard') return <Leaderboard />
  if (profileView === 'runs') return <RunHistory />
  if (profileView === 'challenges') return <ChallengesView />
  if (profileView === 'buddies') return <BuddiesView />

  const rank = getRankFromXP(currentUser.xp)
  const xpProgress = rank.progress * 100

  // Render schedulePreference as a readable label regardless of whether it's
  // an array (new) or a plain string (old persisted value).
  const scheduleLabel = Array.isArray(currentUser.schedulePreference)
    ? (currentUser.schedulePreference as string[]).join(', ')
    : String(currentUser.schedulePreference || '')

  return (
    <div className="space-y-5 pb-4">
      {/* Profile header */}
      <div className="text-center">
        <motion.div {...fadeUp} className="relative inline-block">
          <Avatar className="h-20 w-20 mx-auto ring-4 ring-primary/20">
            <AvatarFallback className={`text-xl text-white ${getAvatarColor(currentUser.name)}`}>{getInitials(currentUser.name)}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 text-2xl">{rank.icon}</div>
        </motion.div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <motion.h2 className="text-xl font-bold" {...fadeUp}>{currentUser.name}</motion.h2>
          <motion.div {...fadeUp}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={openEditDialog}
              aria-label="Edit profile"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        </div>
        {currentUser.bio && <p className="text-sm text-muted-foreground mt-1">{currentUser.bio}</p>}
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">{currentUser.city}</Badge>
          <Badge variant="secondary" className="text-xs capitalize">{currentUser.paceLevel}</Badge>
          {scheduleLabel && <Badge variant="secondary" className="text-xs capitalize">{scheduleLabel}</Badge>}
        </div>
      </div>

      {/* Availability Toggle */}
      <motion.div {...fadeUp}>
        <button
          onClick={toggleAvailability}
          disabled={updateMutation.isPending}
          className="w-full relative overflow-hidden rounded-xl border transition-all duration-300"
          aria-label={isAvailable ? 'Set as not available' : 'Set as available for a run'}
        >
          <AnimatePresence mode="wait">
            {isAvailable ? (
              <motion.div
                key="available"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="p-4 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3.5 w-3.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500" />
                    </span>
                    <div className="text-left">
                      <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                        Available for a run
                      </p>
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">
                        Others can see you're ready to go
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {availableMinutesLeft}m left
                    </p>
                    <div className="h-1.5 w-16 bg-emerald-200 dark:bg-emerald-900 rounded-full mt-1.5 overflow-hidden">
                      <motion.div
                        className="h-full bg-emerald-500 rounded-full"
                        initial={{ width: '100%' }}
                        animate={{ width: `${(availableMinutesLeft / 45) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="unavailable"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="p-4 border-border bg-card hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="h-3.5 w-3.5 rounded-full bg-muted-foreground/30" />
                  <div className="text-left">
                    <p className="font-semibold text-sm">
                      I'm available for a run now
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Toggle to let others know you're ready
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </motion.div>

      {/* Stats row */}
      <motion.div {...fadeUp} className="grid grid-cols-4 gap-2">
        <Card><CardContent className="p-2.5 text-center">
          <div className="flex justify-center text-primary mb-1"><Trophy className="h-4 w-4" /></div>
          <p className="font-bold text-base tabular">{currentUser.totalRuns}</p>
          <p className="text-[9px] text-muted-foreground">Runs</p>
        </CardContent></Card>
        <Card><CardContent className="p-2.5 text-center">
          <div className="flex justify-center text-primary mb-1"><MapPin className="h-4 w-4" /></div>
          <p className="font-bold text-base tabular">{(currentUser.totalDistanceKm ?? 0).toFixed(0)}</p>
          <p className="text-[9px] text-muted-foreground">km</p>
        </CardContent></Card>
        <Card><CardContent className="p-2.5 text-center">
          <div className="flex justify-center text-primary mb-1"><Users className="h-4 w-4" /></div>
          <p className="font-bold text-base tabular">{currentUser.totalPeopleRunWith}</p>
          <p className="text-[9px] text-muted-foreground">Buddies</p>
        </CardContent></Card>
        <Card><CardContent className="p-2.5 text-center">
          <div className="flex justify-center text-primary mb-1"><Flame className="h-4 w-4" /></div>
          <p className="font-bold text-base tabular">{currentUser.longestStreak}</p>
          <p className="text-[9px] text-muted-foreground">Best</p>
        </CardContent></Card>
      </motion.div>

      {/* Quick links */}
      <motion.div {...fadeUp} className="grid grid-cols-2 gap-3">
        <button onClick={() => setProfileView('leaderboard')} className="rounded-xl border bg-card p-3.5 text-left hover:shadow-md transition-shadow flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center"><Trophy className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold">Leaderboard</p><p className="text-[11px] text-muted-foreground">See the rankings</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => setProfileView('runs')} className="rounded-xl border bg-card p-3.5 text-left hover:shadow-md transition-shadow flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Route className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold">Your Runs</p><p className="text-[11px] text-muted-foreground">Run history</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => setProfileView('challenges')} className="rounded-xl border bg-card p-3.5 text-left hover:shadow-md transition-shadow flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-teal-500/15 text-teal-600 flex items-center justify-center"><Target className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold">Challenges</p><p className="text-[11px] text-muted-foreground">Join & compete</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => setProfileView('buddies')} className="rounded-xl border bg-card p-3.5 text-left hover:shadow-md transition-shadow flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><Users className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold">Buddies</p><p className="text-[11px] text-muted-foreground">Friends & DMs</p></div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </motion.div>

      {/* XP Progress */}
      <motion.div {...fadeUp}>
        <Card className="overflow-hidden">
          <div className="gradient-brand-subtle p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{rank.icon}</span>
                <div>
                  <p className="font-bold text-sm">{rank.tier}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.xp} XP</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {rank.isMax ? 'Max rank reached' : `Next: ${rank.nextTierXP} XP`}
              </p>
            </div>
            <Progress value={Math.min(xpProgress, 100)} className="h-2" />
          </div>
        </Card>
      </motion.div>

      {/* Streak */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {currentUser.streak}
              </div>
              <div>
                <p className="font-bold">Day {currentUser.streak} Streak</p>
                <p className="text-xs text-muted-foreground">Keep it going! Best: {currentUser.longestStreak} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Badges */}
      <motion.div {...fadeUp}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Badges</h3>
          <span className="text-xs text-muted-foreground">{badges?.length || 0} earned</span>
        </div>
        {badgesLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : badges && badges.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {badges.map((b) => (
              <Card key={b.id} className="text-center p-2">
                <CardContent className="p-0">
                  <p className="text-2xl mb-1">{b.icon}</p>
                  <p className="text-[10px] font-semibold leading-tight">{b.title}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No badges yet. Join your first run to earn one!
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Appearance */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Appearance</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark</p>
            </div>
            <ThemeToggle />
          </CardContent>
        </Card>
      </motion.div>

      {/* Analytics consent (privacy) */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-sm">Usage analytics</p>
              <p className="text-xs text-muted-foreground">
                Anonymous, never your location. Helps us improve Runsemble.
              </p>
            </div>
            <Switch
              checked={currentUser?.analyticsConsent ?? false}
              onCheckedChange={(v) => {
                if (!currentUser) return
                updateProfile({ analyticsConsent: v })
                apiSend(`/api/users/${currentUser.id}`, 'PATCH', { analyticsConsent: v }).catch(() => {
                  // Revert the optimistic flip if the server didn't take it.
                  updateProfile({ analyticsConsent: !v })
                  toast.error('Could not update that setting')
                })
              }}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Safe zones (privacy) */}
      <motion.div {...fadeUp}>
        <SafeZonesCard />
      </motion.div>

      {/* Account & data (GDPR) */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm">Account &amp; data</p>
              <p className="text-xs text-muted-foreground">Your data belongs to you</p>
            </div>
            <Button className="w-full rounded-full mb-2" onClick={handleInviteFriend}>
              <Share2 className="h-4 w-4 mr-1.5" />Invite a friend to run
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleExportData}>
                <Download className="h-4 w-4 mr-1.5" />My data
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1.5" />Log out
              </Button>
            </div>
            <button
              onClick={handleDeleteAccount}
              className="block w-full text-center text-xs text-muted-foreground/70 hover:text-destructive transition-colors pt-1"
            >
              Delete my account and all data…
            </button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="edit-bio">Bio</Label>
              <Textarea
                id="edit-bio"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell others about yourself..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                placeholder="Your city"
              />
            </div>

            {/* Pace Level */}
            <div className="space-y-2.5">
              <Label>Pace Level</Label>
              <RadioGroup
                value={editPaceLevel}
                onValueChange={(v) => setEditPaceLevel(v as PaceLevel)}
                className="grid grid-cols-2 gap-2"
              >
                {([
                  { value: 'beginner', label: 'Beginner' },
                  { value: 'intermediate', label: 'Intermediate' },
                  { value: 'advanced', label: 'Advanced' },
                  { value: 'any', label: 'Any' },
                ] as const).map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`pace-${option.value}`}
                    className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors text-sm ${
                      editPaceLevel === option.value
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <RadioGroupItem value={option.value} id={`pace-${option.value}`} className="sr-only" />
                    <span
                      className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        editPaceLevel === option.value
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      }`}
                    >
                      {editPaceLevel === option.value && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </span>
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* Schedule Preference — multi-select checkboxes */}
            <div className="space-y-2.5">
              <Label>When do you like to move?</Label>
              <div className="grid grid-cols-3 gap-2">
                {SCHEDULE_OPTIONS.map((opt) => {
                  const active = editSchedule.includes(opt.value)
                  return (
                    <label
                      key={opt.value}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                        active
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={() => toggleScheduleSlot(opt.value)}
                        className="sr-only"
                      />
                      <span className="text-sm font-medium capitalize">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Gender — optional, self-declared; only used to gate women-only runs. */}
            <div className="space-y-2.5">
              <Label>Gender <span className="text-muted-foreground font-normal">(optional — lets you join women-only runs)</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map((opt) => {
                  const active = editGender === opt.value
                  return (
                    <button
                      key={opt.value || 'unset'}
                      type="button"
                      onClick={() => setEditGender(opt.value)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                        active
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={!editName.trim() || updateMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
