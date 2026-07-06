'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowRight, MapPin, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore, type UserProfile, type PaceLevel, type SchedulePreference } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { HotspotsResponse, HotspotResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { AudienceBadge, formatDuration } from './helpers'

// ─── API → store mapping ─────────────────────────────────────────────────────
// One place that turns a user object from any auth endpoint into the store's
// profile shape, with safe defaults.
interface DbUser {
  id: string; name: string; email: string
  avatar?: string | null; bio?: string | null; city?: string
  lat?: number | null; lng?: number | null
  preferredSport?: string; paceLevel?: string; schedulePreference?: string
  xp?: number; streak?: number; longestStreak?: number
  totalRuns?: number; totalPeopleRunWith?: number
  totalDistanceKm?: number; totalDurationSec?: number
  isAvailable?: boolean; availableFrom?: string | null; privacyVisible?: boolean
}

export function toUserProfile(u: DbUser): UserProfile {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar ?? null,
    bio: u.bio ?? null,
    city: u.city ?? 'Antwerp',
    lat: u.lat ?? null,
    lng: u.lng ?? null,
    preferredSport: u.preferredSport ?? 'running',
    paceLevel: (u.paceLevel ?? 'beginner') as PaceLevel,
    schedulePreference: (u.schedulePreference ?? 'evening') as SchedulePreference,
    xp: u.xp ?? 0,
    streak: u.streak ?? 0,
    longestStreak: u.longestStreak ?? 0,
    totalRuns: u.totalRuns ?? 0,
    totalPeopleRunWith: u.totalPeopleRunWith ?? 0,
    totalDistanceKm: u.totalDistanceKm ?? 0,
    totalDurationSec: u.totalDurationSec ?? 0,
    isAvailable: u.isAvailable ?? false,
    availableFrom: u.availableFrom ?? null,
    privacyVisible: u.privacyVisible ?? true,
    onboardingComplete: true,
  }
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
}

/** Step indicator dots used across the onboarding screens */
function StepDots({ current }: { current: number }) {
  const steps = 3 // welcome=0, profile=1, first runs=2
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: steps }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === current ? 20 : 6,
            backgroundColor: i === current ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="h-1.5 rounded-full"
        />
      ))}
    </div>
  )
}

export function OnboardingWelcome() {
  const { setOnboardingStep, setOnboardingAnswer } = useRunsembleStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [showResponse, setShowResponse] = useState(false)
  const options = ['Yesterday', 'Last week', "It's been a while", "I can't remember"]

  const handleSelect = (opt: string) => {
    setSelected(opt)
    setOnboardingAnswer(opt)
    setTimeout(() => setShowResponse(true), 400)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden gradient-brand">
      {/* Subtle animated background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Large soft circles */}
        <motion.div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5"
          animate={{ scale: [1, 1.15, 1], x: [0, 10, 0], y: [0, -10, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5"
          animate={{ scale: [1, 1.1, 1], x: [0, -8, 0], y: [0, 12, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/3 left-1/4 w-40 h-40 rounded-full bg-white/[0.03]"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-2"
        >
          <h1 className="text-4xl font-bold text-white mb-2">Runsemble</h1>
          <p className="text-white/80 text-lg">Because together is better.</p>
        </motion.div>

        {/* Step dots */}
        <div className="mt-6 mb-8">
          <StepDots current={0} />
        </div>

        <AnimatePresence mode="wait">
          {!showResponse ? (
            <motion.div
              key="q"
              {...fadeUp}
              className="w-full max-w-sm"
            >
              <p className="text-white/90 text-center text-lg mb-6 font-medium">
                When did you last feel good after a workout?
              </p>
              <div className="space-y-3">
                {options.map((opt) => (
                  <motion.button
                    key={opt}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSelect(opt)}
                    className={`w-full py-3.5 px-5 rounded-2xl text-left font-medium transition-all duration-200 border-2 backdrop-blur-sm ${
                      selected === opt
                        ? 'bg-white text-orange-700 border-white shadow-lg shadow-white/20'
                        : 'bg-white/15 text-white border-white/30 hover:bg-white/25 hover:border-white/50'
                    }`}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>

              {/* Skip link */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                onClick={() => setOnboardingStep('profile')}
                className="block mx-auto mt-6 text-white/50 hover:text-white/80 text-sm transition-colors duration-200 underline-offset-4 hover:underline"
              >
                Skip for now
              </motion.button>

              {/* Returning users */}
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                onClick={() => setOnboardingStep('login')}
                className="block mx-auto mt-3 text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 underline-offset-4 hover:underline"
              >
                Already have an account? Log in
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="r"
              {...fadeUp}
              className="w-full max-w-sm text-center"
            >
              <motion.p
                className="text-white text-2xl font-semibold mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {selected === 'Yesterday' ? 'Love that.' : "Let's change that."}
              </motion.p>
              <motion.p
                className="text-white/80 text-xl mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                {selected === 'Yesterday' ? "Let's keep it going. Together." : 'Together.'}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Button
                  size="lg"
                  className="rounded-full px-8 py-6 text-base font-semibold bg-white text-orange-700 hover:bg-white/90 hover:shadow-xl hover:shadow-white/20 shadow-xl shadow-black/10 transition-all duration-300"
                  onClick={() => setOnboardingStep('profile')}
                >
                  Let&apos;s go{' '}
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="ml-1 inline-flex"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.span>
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function OnboardingProfile() {
  const { setCurrentUser, setOnboardingStep } = useRunsembleStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [city, setCity] = useState('Antwerp')
  const [paceLevel, setPaceLevel] = useState('beginner')
  const [schedule, setSchedule] = useState('evening')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'ok' | 'denied'>('idle')

  const canSubmit = !!name.trim() && !!email.trim() && password.length >= 8 && consent && !loading

  // Ask for location so "runners near you" and the map centre on the real user.
  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoStatus('denied')
      return
    }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoStatus('ok')
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setErrorMsg(null)
    try {
      // Real account: hashed password + session cookie, via /api/auth/signup.
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          consent,
          city,
          paceLevel,
          schedulePreference: schedule,
          bio,
          lat: coords?.lat,
          lng: coords?.lng,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data?.error ?? 'Something went wrong — please try again')
        setLoading(false)
        return
      }
      setCurrentUser(toUserProfile(data.user))
      // New accounts pick their first runs next — nobody should leave
      // onboarding without a run on the calendar.
      setOnboardingStep('runs')
    } catch {
      setErrorMsg('Network error — please try again')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <motion.div
        {...fadeUp}
        className="flex-1 max-w-md mx-auto w-full"
      >
        {/* Step dots at the top */}
        <div className="mb-6">
          <StepDots current={1} />
        </div>

        <h2 className="text-2xl font-bold mb-1">Set up your profile</h2>
        <p className="text-muted-foreground mb-6">
          This takes 30 seconds. We promise.
        </p>
        <div className="space-y-5">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Location capture */}
          <button
            type="button"
            onClick={requestLocation}
            disabled={geoStatus === 'locating'}
            className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
              geoStatus === 'ok' ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border hover:border-primary/30 hover:bg-muted/50'
            }`}
          >
            <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${geoStatus === 'ok' ? 'bg-emerald-500 text-white' : 'bg-primary/10 text-primary'}`}>
              {geoStatus === 'locating' ? <Loader2 className="h-4 w-4 animate-spin" /> : geoStatus === 'ok' ? <Check className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {geoStatus === 'ok' ? 'Location shared' : geoStatus === 'denied' ? 'Location unavailable' : 'Find runners near me'}
              </p>
              <p className="text-xs text-muted-foreground">
                {geoStatus === 'ok'
                  ? 'The map will centre on you'
                  : geoStatus === 'denied'
                  ? "No worries — we'll use your city"
                  : 'Optional · share your location'}
              </p>
            </div>
          </button>
          <div>
            <Label>Your pace</Label>
            <RadioGroup
              value={paceLevel}
              onValueChange={setPaceLevel}
              className="mt-2 grid grid-cols-2 gap-2"
            >
              {['beginner', 'intermediate', 'advanced', 'any'].map(p => (
                <Label
                  key={p}
                  className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                    paceLevel === p
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={p} />
                  <span className="text-sm font-medium capitalize">
                    {p === 'any' ? 'Any pace' : p}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label>When do you like to move?</Label>
            <RadioGroup
              value={schedule}
              onValueChange={setSchedule}
              className="mt-2 grid grid-cols-3 gap-2"
            >
              {['morning', 'afternoon', 'evening'].map(s => (
                <Label
                  key={s}
                  className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                    schedule === s
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value={s} />
                  <span className="text-sm font-medium capitalize">{s}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="bio">
              Bio <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell others about yourself..."
              className="mt-1.5"
              rows={2}
            />
          </div>
        </div>
        {/* Consent — required, and honest about what we process */}
        <label className="mt-6 flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-0.5"
          />
          <span className="text-xs text-muted-foreground leading-relaxed">
            I agree that Runsemble processes my profile and (approximate) location
            to show me nearby runs and runners. I can export or delete my data at
            any time from my profile.
          </span>
        </label>

        {errorMsg && (
          <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>
        )}

        <motion.div whileTap={{ scale: 0.98 }} className="mt-6">
          <Button
            size="lg"
            className="w-full rounded-full font-semibold hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {loading ? 'Setting up...' : 'Create account & start running'}
          </Button>
        </motion.div>

        <button
          onClick={() => setOnboardingStep('login')}
          className="block mx-auto mt-4 mb-2 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          Already have an account? Log in
        </button>
      </motion.div>
    </div>
  )
}

// Step 3: nobody leaves onboarding without a run on the calendar. Shows the
// official recurring runs (falls back to any upcoming) with one-tap Join.
export function OnboardingRuns() {
  const { setOnboardingStep, updateProfile } = useRunsembleStore()
  const [joined, setJoined] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  const all = data?.hotspots ?? []
  const official = all.filter((h) => h.isOfficial)
  const picks = (official.length >= 2 ? official : all).slice(0, 3)

  const joinMutation = useMutation({
    mutationFn: (id: string) => apiSend<HotspotResponse>(`/api/hotspots/${id}/join`, 'POST'),
    onSuccess: (res, id) => {
      setJoined((prev) => new Set(prev).add(id))
      if (res.xp) {
        updateProfile({ xp: res.xp.newXp })
        toast.success(`+${res.xp.awarded} XP — see you there!`)
      }
    },
    onError: (e: Error, id) => {
      // "Already joined" during onboarding just means: mark it joined.
      if (e.message.toLowerCase().includes('already')) {
        setJoined((prev) => new Set(prev).add(id))
        return
      }
      toast.error(e.message)
    },
  })

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <motion.div {...fadeUp} className="flex-1 max-w-md mx-auto w-full flex flex-col">
        <div className="mb-6">
          <StepDots current={2} />
        </div>

        <h2 className="text-2xl font-bold mb-1">Your first runs are waiting</h2>
        <p className="text-muted-foreground mb-6">
          These runs happen every week near you. Join one — showing up is the whole point.
        </p>

        <div className="space-y-3">
          {isLoading &&
            [1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
          {!isLoading && picks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming runs yet — you can create one from the Explore tab.
            </p>
          )}
          {picks.map((h) => {
            const isJoined = joined.has(h.id)
            return (
              <div key={h.id} className="rounded-2xl border bg-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm">{h.name}</p>
                    <AudienceBadge audience={h.audience} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {h.scheduleLabel ?? `in ${formatDuration(h.minutesUntil)}`} · {h.location}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{h.participantCount} joining</p>
                </div>
                <Button
                  size="sm"
                  variant={isJoined ? 'secondary' : 'default'}
                  className="rounded-full shrink-0"
                  disabled={joinMutation.isPending && !isJoined}
                  onClick={() => !isJoined && joinMutation.mutate(h.id)}
                >
                  {isJoined ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Joined
                    </>
                  ) : (
                    'Join'
                  )}
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-auto pt-8 pb-2">
          <Button
            size="lg"
            className="w-full rounded-full font-semibold"
            onClick={() => setOnboardingStep('done')}
          >
            {joined.size > 0
              ? `Let's go — ${joined.size} run${joined.size > 1 ? 's' : ''} planned`
              : "Continue — I'll find runs later"}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

export function OnboardingLogin() {
  const { setCurrentUser, setOnboardingStep } = useRunsembleStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() || !password || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data?.error ?? 'Could not log in')
        setLoading(false)
        return
      }
      setCurrentUser(toUserProfile(data.user))
      setOnboardingStep('done')
    } catch {
      setErrorMsg('Network error — please try again')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 bg-background">
      <motion.div {...fadeUp} className="max-w-md mx-auto w-full">
        <h1 className="text-2xl font-extrabold tracking-tight text-primary mb-1">Runsemble</h1>
        <h2 className="text-2xl font-bold mb-1">Welcome back</h2>
        <p className="text-muted-foreground mb-6">Log in and find your next run.</p>

        <div className="space-y-5">
          <div>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="mt-1.5"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div>
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="mt-1.5"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>

        {errorMsg && (
          <p className="mt-4 text-sm text-destructive" role="alert">{errorMsg}</p>
        )}

        <Button
          size="lg"
          className="w-full rounded-full font-semibold mt-6"
          onClick={submit}
          disabled={!email.trim() || !password || loading}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <button
          onClick={() => setOnboardingStep('welcome')}
          className="block mx-auto mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
        >
          New here? Create a profile
        </button>
      </motion.div>
    </div>
  )
}