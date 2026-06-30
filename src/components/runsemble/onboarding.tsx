'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
}

/** Step indicator dots used on the welcome & profile screens */
function StepDots({ current }: { current: number }) {
  const steps = 2 // welcome=0, profile=1
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
  const { setOnboardingStep } = useRunsembleStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [showResponse, setShowResponse] = useState(false)
  const options = ['Yesterday', 'Last week', "It's been a while", "I can't remember"]

  const handleSelect = (opt: string) => {
    setSelected(opt)
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
        {/* Diagonal lines pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="onboard-lines" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="40" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#onboard-lines)" />
        </svg>
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
                Let&apos;s change that.
              </motion.p>
              <motion.p
                className="text-white/80 text-xl mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                Together.
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
  const [city, setCity] = useState('Antwerp')
  const [paceLevel, setPaceLevel] = useState('beginner')
  const [schedule, setSchedule] = useState('evening')
  const [bio, setBio] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !email) return
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          city,
          paceLevel,
          schedulePreference: schedule,
          bio,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Failed to create user:', err)
        setLoading(false)
        return
      }
      const data = await res.json()
      const dbUser = data.user ?? data
      setCurrentUser({
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        avatar: dbUser.avatar,
        bio: dbUser.bio,
        city: dbUser.city,
        preferredSport: dbUser.preferredSport ?? 'running',
        paceLevel: dbUser.paceLevel ?? 'beginner',
        schedulePreference: dbUser.schedulePreference ?? 'evening',
        xp: dbUser.xp ?? 0,
        streak: dbUser.streak ?? 0,
        longestStreak: dbUser.longestStreak ?? 0,
        totalRuns: dbUser.totalRuns ?? 0,
        totalPeopleRunWith: dbUser.totalPeopleRunWith ?? 0,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      })
      setOnboardingStep('done')
    } catch (e) {
      console.error('Onboarding error:', e)
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
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="mt-1.5"
            />
          </div>
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
        <motion.div whileTap={{ scale: 0.98 }} className="mt-8">
          <Button
            size="lg"
            className="w-full rounded-full font-semibold hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
            onClick={handleSubmit}
            disabled={!name || !email || loading}
          >
            {loading ? 'Setting up...' : 'Start Running Together'}
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}