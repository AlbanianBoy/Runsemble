'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowRight, MapPin, Loader2, Check, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore, type UserProfile, type PaceLevel, type ScheduleSlot } from '@/lib/store'
import { PACE_LEVELS, SCHEDULE_PREFERENCES, canJoinAudience } from '@/lib/enums'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import { track } from '@/lib/analytics'
import { MIN_AGE, isOldEnough } from '@/lib/consent'
import { validatePassword } from '@/lib/password-policy'
import type { HotspotsResponse, HotspotResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { AudienceBadge, formatDuration } from './helpers'

// ─── API → store mapping ─────────────────────────────────────────────────────
interface DbUser {
  id: string; name: string; email: string; emailVerified?: boolean
  avatar?: string | null; bio?: string | null; city?: string
  lat?: number | null; lng?: number | null
  gender?: string | null
  availabilityAudience?: string | null
  preferredSport?: string; paceLevel?: string; schedulePreference?: string
  xp?: number; streak?: number; longestStreak?: number
  totalRuns?: number; totalPeopleRunWith?: number
  totalDistanceKm?: number; totalDurationSec?: number
  isAvailable?: boolean; availableFrom?: string | null; privacyVisible?: boolean
  analyticsConsent?: boolean
  consentVersion?: string | null
}

export function toUserProfile(u: DbUser): UserProfile {
  // schedulePreference arrives from the DB as a comma-separated string.
  // Split into an array, filtering empty strings so new users get [].
  const scheduleRaw = u.schedulePreference ?? ''
  const schedulePreference = scheduleRaw
    ? (scheduleRaw.split(',').map((s) => s.trim()).filter(Boolean) as ScheduleSlot[])
    : []

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerified ?? false,
    avatar: u.avatar ?? null,
    bio: u.bio ?? null,
    city: u.city ?? 'Antwerp',
    lat: u.lat ?? null,
    lng: u.lng ?? null,
    gender: u.gender ?? null,
    preferredSport: u.preferredSport ?? 'running',
    paceLevel: (u.paceLevel ?? 'beginner') as PaceLevel,
    schedulePreference,
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
    // Only ever present on your OWN payload — toPublicUser strips it, so this
    // falls back to 'everyone' for anyone else's profile, which is right.
    availabilityAudience: u.availabilityAudience ?? 'everyone',
    analyticsConsent: u.analyticsConsent ?? false,
    consentVersion: u.consentVersion ?? null,
    onboardingComplete: true,
  }
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
}

// The forward path through signup, in the order a person walks it. Logging in is
// a side branch, not a step, so it isn't counted.
const ONBOARDING_STEPS = ['welcome', 'account', 'profile', 'verify', 'runs'] as const

/**
 * Step indicator for onboarding.
 *
 * Two things were wrong with it. It hardcoded three dots for a five-screen flow
 * and skipped the verify screen entirely, so the count was a guess and it
 * vanished at exactly the point people are most likely to abandon. And the
 * colours were hardcoded white — right on the brand-coloured welcome screen,
 * invisible on the three that sit on bg-background, which is most of them.
 *
 * `tone` picks the palette rather than assuming one, and the label is announced,
 * because otherwise this is decoration a screen reader can't use.
 */
function StepDots({ current, tone = 'default' }: { current: number; tone?: 'brand' | 'default' }) {
  const total = ONBOARDING_STEPS.length
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ width: i === current ? 20 : 6 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className={`h-1.5 rounded-full ${
            tone === 'brand'
              ? i === current ? 'bg-white/95' : 'bg-white/35'
              : i === current ? 'bg-primary' : 'bg-muted-foreground/25'
          }`}
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background text-foreground">
      <div className="relative z-10 flex flex-col items-center w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-2"
        >
          <h1 className="text-5xl font-bold tracking-tight text-primary mb-2">Runsemble</h1>
          <p className="text-muted-foreground text-lg">Because together is better.</p>
        </motion.div>

        <div className="mt-6 mb-8">
          <StepDots current={0} tone="default" />
        </div>

        <AnimatePresence mode="wait">
          {!showResponse ? (
            <motion.div key="q" {...fadeUp} className="w-full max-w-sm">
              <p className="text-foreground/90 text-center text-lg mb-6 font-medium">
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
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25'
                        : 'bg-card/70 text-foreground border-border hover:bg-card hover:border-primary/40'
                    }`}
                  >
                    {opt}
                  </motion.button>
                ))}
              </div>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                onClick={() => setOnboardingStep('profile')}
                className="block mx-auto mt-6 text-muted-foreground hover:text-foreground text-sm transition-colors duration-200 underline-offset-4 hover:underline"
              >
                Skip for now
              </motion.button>
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                onClick={() => setOnboardingStep('login')}
                className="block mx-auto mt-3 text-foreground/80 hover:text-foreground text-sm font-medium transition-colors duration-200 underline-offset-4 hover:underline"
              >
                Already have an account? Log in
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="r" {...fadeUp} className="w-full max-w-sm text-center">
              <motion.p
                className="text-foreground text-2xl font-semibold mb-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {selected === 'Yesterday' ? 'Love that.' : "Let's change that."}
              </motion.p>
              <motion.p
                className="text-muted-foreground text-xl mb-8"
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
                  className="rounded-full px-8 py-6 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 shadow-lg shadow-primary/25 transition-all duration-300"
                  onClick={() => setOnboardingStep('profile')}
                >
                  Let&apos;s go{' '}
                  {/* Static. This arrow slid back and forth forever on the first
                      screen anyone sees — the exact "obviously AI-made" tell the
                      design direction rules out, and it outranked the words next
                      to it for attention while saying nothing they didn't. */}
                  <ArrowRight className="ml-1 h-4 w-4 inline-flex" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Built from SCHEDULE_PREFERENCES rather than written out again, so the tiles and
// the values the API accepts cannot drift apart. Record<ScheduleSlot, …> is the
// load-bearing part: add a slot to enums.ts and this stops compiling until it has
// a label here. Hand-written, a new slot would render fine and 400 on save.
const SCHEDULE_META: Record<ScheduleSlot, { label: string; emoji: string }> = {
  morning:   { label: 'Morning',   emoji: '🌅' },
  afternoon: { label: 'Afternoon', emoji: '☀️' },
  evening:   { label: 'Evening',   emoji: '🌙' },
}
const SCHEDULE_OPTIONS = SCHEDULE_PREFERENCES.map((id) => ({ id, ...SCHEDULE_META[id] }))

// Same deal for pace. This list literally included 'any' while the database enum
// did not, so "Any pace" typechecked, rendered, and then failed signup with a 500.
const PACE_META: Record<PaceLevel, { label: string }> = {
  beginner:     { label: 'Beginner' },
  intermediate: { label: 'Intermediate' },
  advanced:     { label: 'Advanced' },
  any:          { label: 'Any pace' },
}
const PACE_OPTIONS = PACE_LEVELS.map((id) => ({ id, ...PACE_META[id] }))

// Password rules come from password-policy.ts — same module the server uses —
// so the form and signup can't disagree. Hashing stays server-only in password.ts.

// Deliberately loose. The only thing worth catching here is a slip like a
// missing @; anything stricter starts turning away addresses that deliver fine,
// and the verification code is the real proof the inbox exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type AccountField = 'name' | 'email' | 'password' | 'birthdate'
type FieldNote = { message: string; tone: 'hint' | 'error' }

// The same sentence carries both jobs — only the colour changes. "Password must
// be at least 8 characters" is an instruction while you're on character four and
// a complaint once you've left the field, and it shouldn't look like a complaint
// until then.
function FieldMessage({ id, note }: { id: string; note: FieldNote }) {
  return (
    <p
      id={id}
      className={`mt-1.5 text-xs ${note.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      {note.message}
    </p>
  )
}

export function OnboardingProfile() {
  const { setCurrentUser, updateProfile, setOnboardingStep } = useRunsembleStore()

  // Two steps, not one long wall. Step 1 is the minimum to have an account —
  // once it succeeds the account is banked, so step 2 (the "about you" details)
  // is genuinely optional and can be skipped. Everyone you'll ever sign up passes
  // through this screen, so the shorter the first ask, the more of them finish.
  const [step, setStep] = useState<'account' | 'about'>('account')

  // Step 1 — account essentials
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [birthdate, setBirthdate] = useState('') // YYYY-MM-DD from the date input
  const [analyticsOptIn, setAnalyticsOptIn] = useState(false)

  // Step 2 — profile (all optional, defaults on the server)
  const [userId, setUserId] = useState<string | null>(null)
  const [city, setCity] = useState('Antwerp')
  const [paceLevel, setPaceLevel] = useState('beginner')
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]) // multi-select, no preset
  const [bio, setBio] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'ok' | 'denied'>('idle')

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Which account fields the person has finished with. An unmet requirement they
  // haven't reached yet is guidance; the same requirement after they've left the
  // field is an error. The form used to say nothing at all, but the cure for
  // silence isn't going red at someone halfway through typing their email.
  const [touched, setTouched] = useState<Record<AccountField, boolean>>({
    name: false, email: false, password: false, birthdate: false,
  })
  const markTouched = (field: AccountField) =>
    setTouched((prev) => ({ ...prev, [field]: true }))

  // Every requirement in one place. These were three unrelated mechanisms — a
  // boolean that greyed out the button and explained nothing, a lone red line
  // under the date of birth, and the password policy arriving from the server as
  // a toast — so you could satisfy one and still have no idea what was left.
  // The server re-checks all of it; none of this is trusted, it's just faster.
  const nameIssue = name.trim() ? null : 'Add your name'
  const emailIssue = !email.trim()
    ? 'Add your email address'
    : EMAIL_PATTERN.test(email.trim())
      ? null
      : 'That doesn’t look like an email address'
  const passwordIssue = validatePassword(password, email)
  const birthdateIssue = !birthdate
    ? 'Add your date of birth'
    : isOldEnough(birthdate)
      ? null
      : `You must be at least ${MIN_AGE} to use Runsemble`

  // A message appears once there's something to react to: the field has content,
  // or they've already moved on from it. An empty field nobody has touched stays
  // quiet — its label is already doing that job.
  const noteFor = (field: AccountField, value: string, issue: string | null): FieldNote | null => {
    if (!issue || (!value && !touched[field])) return null
    return { message: issue, tone: touched[field] ? 'error' : 'hint' }
  }
  const nameNote = noteFor('name', name, nameIssue)
  const emailNote = noteFor('email', email, emailIssue)
  const passwordNote = noteFor('password', password, passwordIssue)
  const birthdateNote = noteFor('birthdate', birthdate, birthdateIssue)

  // What the disabled button is still waiting for, spelled out under it. Deriving
  // canCreate from this same list is the point: the button can't be dead for a
  // reason the list doesn't mention.
  const outstanding = [
    nameIssue && 'your name',
    emailIssue && 'your email',
    passwordIssue && 'a password',
    birthdateIssue && 'your date of birth',
    !consent && 'the data-processing agreement',
  ].filter((item): item is string => typeof item === 'string')

  const canCreate = outstanding.length === 0 && !loading

  const toggleSchedule = (slot: ScheduleSlot) => {
    setSchedule((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]))
  }

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

  // Step 1: create the account, then move on. The session is set on success, so
  // the step-2 profile save is authenticated.
  const handleCreateAccount = async () => {
    if (!canCreate) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, consent, birthdate, analyticsConsent: analyticsOptIn }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(data?.error ?? 'Something went wrong — please try again')
        setLoading(false)
        return
      }
      setCurrentUser(toUserProfile(data.user))
      setUserId(data.user.id)
      track('account_created')
      setStep('about')
    } catch {
      setErrorMsg('Network error — please try again')
    }
    setLoading(false)
  }

  // Step 2: save the optional profile, then go STRAIGHT to the payoff (browse
  // runs). Email verification used to sit here as a wall before the user saw any
  // value; it now comes after runs and is skippable. Skipping the profile does
  // the same minus the save — the account already exists either way.
  const handleSaveProfile = async () => {
    if (!userId) return setOnboardingStep('runs')
    setLoading(true)
    try {
      const patched = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          paceLevel,
          schedulePreference: schedule.join(','), // CSV string; DB column is String
          bio,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        }),
      })
      if (patched.ok) {
        // Keep the local store in step so the map centres and the profile reads right.
        updateProfile({
          city,
          paceLevel: paceLevel as PaceLevel,
          schedulePreference: schedule,
          bio,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        })
      }
    } catch {
      // A failed save must not trap the user — the account exists; they can edit later.
    }
    track('onboarding_profile_saved')
    setLoading(false)
    setOnboardingStep('runs')
  }

  // M28 fix: map the internal sub-step to its dot position so the indicator
  // actually advances. Previously hardcoded to 1 regardless of `step`.
  //   'account' → dot 1  (create your account form)
  //   'about'   → dot 2  (running profile details)
  // 'account' is step 2 of the five; the details panel after it is step 3.
  const dotIndex = step === 'account' ? 1 : 2

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <div className="flex-1 max-w-md mx-auto w-full">
        <div className="mb-6">
          <StepDots current={dotIndex} />
        </div>

        {/* No AnimatePresence: mode="wait" could leave the exiting panel mid-exit
            and never mount the next one, freezing the screen. The entering panel
            plays its own fadeUp on mount, which is all the motion this needs. */}
        <div>
          {step === 'account' ? (
            <motion.div key="account" {...fadeUp}>
              <h2 className="text-2xl font-bold mb-1">Create your account</h2>
              <p className="text-muted-foreground mb-6">Two quick steps and you&rsquo;re in.</p>

              <div className="space-y-5">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => markTouched('name')}
                    placeholder="Your name"
                    className="mt-1.5"
                    aria-invalid={nameNote?.tone === 'error'}
                    aria-describedby={nameNote ? 'name-note' : undefined}
                  />
                  {nameNote && <FieldMessage id="name-note" note={nameNote} />}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched('email')}
                    placeholder="you@email.com"
                    className="mt-1.5"
                    aria-invalid={emailNote?.tone === 'error'}
                    aria-describedby={emailNote ? 'email-note' : undefined}
                  />
                  {emailNote && <FieldMessage id="email-note" note={emailNote} />}
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => markTouched('password')}
                    placeholder="At least 8 characters"
                    className="mt-1.5"
                    aria-invalid={passwordNote?.tone === 'error'}
                    aria-describedby={passwordNote ? 'password-note' : undefined}
                  />
                  {passwordNote && <FieldMessage id="password-note" note={passwordNote} />}
                </div>
                <div>
                  <Label htmlFor="birthdate">Date of birth</Label>
                  <Input
                    id="birthdate"
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    onBlur={() => markTouched('birthdate')}
                    className="mt-1.5"
                    aria-invalid={birthdateNote?.tone === 'error'}
                    aria-describedby={birthdateNote ? 'birthdate-note' : undefined}
                  />
                  {birthdateNote && <FieldMessage id="birthdate-note" note={birthdateNote} />}
                </div>
              </div>

              <label className="mt-6 flex items-start gap-3 cursor-pointer">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  I agree that Runsemble processes my profile and (approximate) location to show me nearby runs and
                  runners, and I confirm I&rsquo;m at least {MIN_AGE}. I can export or delete my data any time from my
                  profile. See our <a href="/privacy" target="_blank" className="text-primary underline underline-offset-2">privacy policy</a>.
                </span>
              </label>

              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                <Checkbox checked={analyticsOptIn} onCheckedChange={(v) => setAnalyticsOptIn(v === true)} className="mt-0.5" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Optional: help improve Runsemble with anonymous usage analytics (never your location). You can
                  turn this off any time in your profile.
                </span>
              </label>

              {errorMsg && <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>}

              <motion.div whileTap={{ scale: 0.98 }} className="mt-6">
                <Button
                  size="lg"
                  className="w-full rounded-full font-semibold"
                  onClick={handleCreateAccount}
                  disabled={!canCreate}
                  aria-describedby={outstanding.length > 0 ? 'create-account-todo' : undefined}
                >
                  {loading ? 'Creating account…' : 'Continue'}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </motion.div>

              {/* Rendered even when empty so the live region already exists when the
                  list changes — a region that appears at the same moment as its text
                  is announced by roughly nothing. A disabled button can't be focused,
                  so this is the only way the remaining requirements get spoken. */}
              <p
                id="create-account-todo"
                aria-live="polite"
                className="mt-2 text-center text-xs text-muted-foreground"
              >
                {outstanding.length > 0 ? `Still needed: ${outstanding.join(' · ')}` : ''}
              </p>

              <button
                onClick={() => setOnboardingStep('login')}
                className="block mx-auto mt-4 mb-2 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Already have an account? Log in
              </button>
            </motion.div>
          ) : (
            <motion.div key="about" {...fadeUp}>
              <h2 className="text-2xl font-bold mb-1">A little about your running</h2>
              <p className="text-muted-foreground mb-6">Helps us match you with the right runs. You can skip this.</p>

              <div className="space-y-5">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5" />
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
                      {geoStatus === 'ok' ? 'The map will centre on you' : geoStatus === 'denied' ? "No worries — we'll use your city" : 'Optional · share your location'}
                    </p>
                  </div>
                </button>

                {/* Pace — single-select */}
                <div>
                  <Label>Your pace</Label>
                  <RadioGroup value={paceLevel} onValueChange={setPaceLevel} className="mt-2 grid grid-cols-2 gap-2">
                    {PACE_OPTIONS.map(({ id, label }) => (
                      <Label
                        key={id}
                        className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                          paceLevel === id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30 hover:bg-muted/50'
                        }`}
                      >
                        <RadioGroupItem value={id} />
                        <span className="text-sm font-medium">{label}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>

                {/* Schedule — multi-select, no preset */}
                <div>
                  <Label>When do you like to move? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {SCHEDULE_OPTIONS.map(({ id, label, emoji }) => {
                      const checked = schedule.includes(id)
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleSchedule(id)}
                          className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 ${
                            checked ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30 hover:bg-muted/50'
                          }`}
                        >
                          <span className="text-xl">{emoji}</span>
                          <span className="text-sm font-medium">{label}</span>
                          <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" aria-hidden />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="bio">Bio <span className="text-muted-foreground">(optional)</span></Label>
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others about yourself..." className="mt-1.5" rows={2} />
                </div>
              </div>

              <motion.div whileTap={{ scale: 0.98 }} className="mt-6">
                <Button size="lg" className="w-full rounded-full font-semibold" onClick={handleSaveProfile} disabled={loading}>
                  {loading ? 'Saving…' : 'Save & continue'}
                </Button>
              </motion.div>

              <button
                onClick={() => { track('onboarding_skipped'); setOnboardingStep('runs') }}
                className="block mx-auto mt-4 mb-2 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Skip for now
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export function OnboardingRuns() {
  const { setOnboardingStep, updateProfile, currentUser } = useRunsembleStore()
  const [joined, setJoined] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  // Only suggest runs this person can actually join. The server enforces
  // women-only correctly, which meant a man's very first act in the app could
  // be tapping Join on one of three recommended runs and getting a 403 — a rule
  // learned as a rejection, in the worst possible place to learn it.
  const eligible = (data?.hotspots ?? []).filter((h) =>
    canJoinAudience(currentUser?.gender, h.audience)
  )
  const official = eligible.filter((h) => h.isOfficial)
  const picks = (official.length >= 2 ? official : eligible).slice(0, 3)

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
      // Prefer the stable code (conflict) once the join route emits it; fall
      // back to the old prose match so a partial deploy can't strand the UI.
      const already =
        (e instanceof ApiError && e.code === 'conflict') ||
        e.message.toLowerCase().includes('already')
      if (already) {
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
          <StepDots current={4} />
        </div>

        <h2 className="text-2xl font-bold mb-1">Your first runs are waiting</h2>
        <p className="text-muted-foreground mb-4">
          These runs happen every week near you. Join one — showing up is the whole point.
        </p>

        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 flex gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-semibold text-foreground mb-0.5">Running with new people?</p>
            Meet in a public place in daylight for a first run, and tell a friend where you&rsquo;ll be.
            Your location is only ever shown approximately, you can hide areas like home, and you can
            block or report anyone in a tap.
          </div>
        </div>

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
                    <><Check className="h-4 w-4 mr-1" />Joined</>
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
            onClick={() => setOnboardingStep('verify')}
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

export function OnboardingVerifyEmail() {
  const { currentUser, updateProfile, setOnboardingStep } = useRunsembleStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const verify = async () => {
    if (code.trim().length < 6 || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      await apiSend<{ ok: boolean }>('/api/auth/verify-email', 'POST', { code: code.trim() })
      updateProfile({ emailVerified: true })
      toast.success('Email verified ✅')
      setOnboardingStep('done')
    } catch (e) {
      setErrorMsg((e as Error).message)
    }
    setLoading(false)
  }

  const resend = async () => {
    if (resending) return
    setResending(true)
    setErrorMsg(null)
    try {
      await apiSend<{ ok: boolean }>('/api/auth/send-verification', 'POST')
      toast.success('New code sent — check your inbox')
    } catch (e) {
      toast.error((e as Error).message)
    }
    setResending(false)
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 bg-background">
      <motion.div {...fadeUp} className="max-w-md mx-auto w-full">
        {/* This screen had no step indicator at all, which is where it was needed
            most: it is the one place the flow leaves the app to wait on an email,
            and the point people are likeliest to give up. Showing how far along
            they are, and that there is one step left, is the cheap part of not
            losing them. */}
        <div className="mb-6">
          <StepDots current={3} />
        </div>
        <h2 className="text-2xl font-bold mb-1">Confirm your email</h2>
        <p className="text-muted-foreground mb-6">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-foreground">{currentUser?.email}</span>. Enter it below.
        </p>
        <Label htmlFor="verify-code">Verification code</Label>
        <Input
          id="verify-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          className="mt-1.5 text-center text-2xl tracking-[0.4em] font-semibold tabular"
          onKeyDown={(e) => e.key === 'Enter' && verify()}
        />
        {errorMsg && (
          <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>
        )}
        <Button
          size="lg"
          className="w-full rounded-full font-semibold mt-6"
          onClick={verify}
          disabled={code.trim().length < 6 || loading}
        >
          {loading ? 'Verifying…' : 'Verify email'}
        </Button>
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            onClick={resend}
            disabled={resending}
            className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={() => setOnboardingStep('done')}
            className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export function OnboardingLogin() {
  const { setCurrentUser, setOnboardingStep } = useRunsembleStore()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
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

  if (mode === 'forgot') {
    return <ForgotPasswordForm initialEmail={email} onBack={() => setMode('login')} />
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
            <button
              type="button"
              onClick={() => { setErrorMsg(null); setMode('forgot') }}
              className="mt-2 block ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
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

function ForgotPasswordForm({
  initialEmail,
  onBack,
}: {
  initialEmail: string
  onBack: () => void
}) {
  const [stage, setStage] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sendCode = async () => {
    if (!email.trim() || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      await apiSend<{ ok: boolean }>('/api/auth/forgot-password', 'POST', { email: email.trim() })
      toast.success('If that email has an account, a code is on the way.')
      setStage('reset')
    } catch (e) {
      setErrorMsg((e as Error).message)
    }
    setLoading(false)
  }

  const reset = async () => {
    if (code.trim().length < 6 || password.length < 8 || loading) return
    setLoading(true)
    setErrorMsg(null)
    try {
      await apiSend<{ ok: boolean }>('/api/auth/reset-password', 'POST', {
        email: email.trim(),
        code: code.trim(),
        password,
      })
      toast.success('Password updated — log in with your new password.')
      onBack()
    } catch (e) {
      setErrorMsg((e as Error).message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col justify-center p-6 bg-background">
      <motion.div {...fadeUp} className="max-w-md mx-auto w-full">
        <button
          onClick={onBack}
          className="mb-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to log in
        </button>
        <h2 className="text-2xl font-bold mb-1">Reset password</h2>
        {stage === 'email' ? (
          <>
            <p className="text-muted-foreground mb-6">
              Enter your email and we&apos;ll send you a 6-digit code.
            </p>
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="mt-1.5"
              onKeyDown={(e) => e.key === 'Enter' && sendCode()}
            />
            {errorMsg && <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>}
            <Button
              size="lg"
              className="w-full rounded-full font-semibold mt-6"
              onClick={sendCode}
              disabled={!email.trim() || loading}
            >
              {loading ? 'Sending…' : 'Send reset code'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mb-6">
              Enter the code sent to{' '}
              <span className="font-medium text-foreground">{email}</span> and choose a new password.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reset-code">Code</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-1.5 text-center text-xl tracking-[0.3em] font-semibold"
                />
              </div>
              <div>
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="mt-1.5"
                  onKeyDown={(e) => e.key === 'Enter' && reset()}
                />
              </div>
            </div>
            {errorMsg && <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>}
            <Button
              size="lg"
              className="w-full rounded-full font-semibold mt-6"
              onClick={reset}
              disabled={code.trim().length < 6 || password.length < 8 || loading}
            >
              {loading ? 'Resetting…' : 'Reset password'}
            </Button>
            <button
              onClick={sendCode}
              disabled={loading}
              className="block mx-auto mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
