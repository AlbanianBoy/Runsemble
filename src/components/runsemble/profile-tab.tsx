'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Users, Flame, Pencil, Loader2, Check, MapPin, Route, ChevronRight, Target } from 'lucide-react'
import { useRunsembleStore, getRankFromXP, type PaceLevel, type SchedulePreference } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { BadgesResponse } from '@/lib/types'
import { Leaderboard } from './leaderboard'
import { RunHistory } from './run-history'
import { ThemeToggle } from './theme-toggle'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

export function ProfileTab() {
  const { currentUser, updateProfile, profileView, setProfileView } = useRunsembleStore()
  const queryClient = useQueryClient()

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editPaceLevel, setEditPaceLevel] = useState<PaceLevel>('beginner')
  const [editSchedule, setEditSchedule] = useState<SchedulePreference>('evening')

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
    updateProfile({ isAvailable: true })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: true }).catch(() => {})
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
    updateProfile({ isAvailable: false })
    if (currentUser?.id) {
      apiSend(`/api/users/${currentUser.id}`, 'PUT', { isAvailable: false }).catch(() => {})
    }
  }, [updateProfile, currentUser])

  const openEditDialog = () => {
    if (!currentUser) return
    setEditName(currentUser.name)
    setEditBio(currentUser.bio || '')
    setEditCity(currentUser.city)
    setEditPaceLevel(currentUser.paceLevel)
    setEditSchedule(currentUser.schedulePreference)
    setEditOpen(true)
  }

  const handleSaveProfile = async () => {
    const trimmedName = editName.trim()
    if (!trimmedName) return

    const updates = {
      name: trimmedName,
      bio: editBio.trim() || null,
      city: editCity.trim() || 'Antwerp',
      paceLevel: editPaceLevel,
      schedulePreference: editSchedule,
    }

    updateMutation.mutate(updates, {
      onSuccess: () => {
        updateProfile(updates)
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

  if (!currentUser) return <Skeleton className="h-64 w-full rounded-xl" />

  // Sub-views reachable from the profile.
  if (profileView === 'leaderboard') return <Leaderboard />
  if (profileView === 'runs') return <RunHistory />
  if (profileView === 'challenges') return <ChallengesView />
  if (profileView === 'buddies') return <BuddiesView />

  const rank = getRankFromXP(currentUser.xp)
  const xpProgress = rank.progress * 100

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
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="secondary" className="text-xs">{currentUser.city}</Badge>
          <Badge variant="secondary" className="text-xs capitalize">{currentUser.paceLevel}</Badge>
          <Badge variant="secondary" className="text-xs capitalize">{currentUser.schedulePreference}</Badge>
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

      {/* Edit Profile Button (mobile-friendly) */}
      <motion.div {...fadeUp}>
        <Button
          variant="outline"
          className="w-full h-11 text-sm font-medium"
          onClick={openEditDialog}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit Profile
        </Button>
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
          <div className="h-9 w-9 rounded-full bg-violet-500/15 text-violet-600 flex items-center justify-center"><Target className="h-5 w-5" /></div>
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

            {/* Schedule Preference */}
            <div className="space-y-2.5">
              <Label>Schedule Preference</Label>
              <RadioGroup
                value={editSchedule}
                onValueChange={(v) => setEditSchedule(v as SchedulePreference)}
                className="space-y-2"
              >
                {([
                  { value: 'morning', label: 'Morning', desc: 'Early bird runs' },
                  { value: 'afternoon', label: 'Afternoon', desc: 'Midday energy' },
                  { value: 'evening', label: 'Evening', desc: 'Sunset sessions' },
                ] as const).map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`schedule-${option.value}`}
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${
                      editSchedule === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value={option.value} id={`schedule-${option.value}`} className="sr-only" />
                      <span
                        className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                          editSchedule === option.value
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/30'
                        }`}
                      >
                        {editSchedule === option.value && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                        )}
                      </span>
                      <span className="text-sm font-medium">{option.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{option.desc}</span>
                  </Label>
                ))}
              </RadioGroup>
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