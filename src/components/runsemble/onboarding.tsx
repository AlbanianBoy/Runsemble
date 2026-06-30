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

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } }

export function OnboardingWelcome() {
  const { setOnboardingStep } = useRunsembleStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [showResponse, setShowResponse] = useState(false)
  const options = ['Yesterday', 'Last week', "It's been a while", "I can't remember"]

  const handleSelect = (opt: string) => { setSelected(opt); setTimeout(() => setShowResponse(true), 400) }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gradient-brand">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
        <h1 className="text-4xl font-bold text-white mb-2 text-center">Runsemble</h1>
        <p className="text-white/80 text-center text-lg mb-10">Because together is better.</p>
      </motion.div>
      <AnimatePresence mode="wait">
        {!showResponse ? (
          <motion.div key="q" {...fadeUp} className="w-full max-w-sm">
            <p className="text-white/90 text-center text-lg mb-6 font-medium">When did you last feel good after a workout?</p>
            <div className="space-y-3">
              {options.map((opt) => (
                <motion.button key={opt} whileTap={{ scale: 0.97 }} onClick={() => handleSelect(opt)}
                  className={`w-full py-3.5 px-5 rounded-2xl text-left font-medium transition-all duration-200 border-2 ${selected === opt ? 'bg-white text-orange-700 border-white shadow-lg' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}>
                  {opt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="r" {...fadeUp} className="w-full max-w-sm text-center">
            <p className="text-white text-2xl font-semibold mb-2">Let&apos;s change that.</p>
            <p className="text-white/80 text-xl mb-8">Together.</p>
            <Button size="lg" className="rounded-full px-8 py-6 text-base font-semibold bg-white text-orange-700 hover:bg-white/90 shadow-xl" onClick={() => setOnboardingStep('profile')}>
              Let&apos;s go <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, city, paceLevel, schedulePreference: schedule, bio }),
      })
      const user = await res.json()
      setCurrentUser({ ...user, onboardingComplete: true, isAvailable: false, privacyVisible: true })
      setOnboardingStep('done')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col p-6 bg-background">
      <motion.div {...fadeUp} className="flex-1 max-w-md mx-auto w-full">
        <h2 className="text-2xl font-bold mb-1">Set up your profile</h2>
        <p className="text-muted-foreground mb-6">This takes 30 seconds. We promise.</p>
        <div className="space-y-5">
          <div><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="mt-1.5" /></div>
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="mt-1.5" /></div>
          <div><Label htmlFor="city">City</Label><Input id="city" value={city} onChange={e => setCity(e.target.value)} className="mt-1.5" /></div>
          <div><Label>Your pace</Label>
            <RadioGroup value={paceLevel} onValueChange={setPaceLevel} className="mt-2 grid grid-cols-2 gap-2">
              {['beginner', 'intermediate', 'advanced', 'any'].map(p => (
                <Label key={p} className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-colors ${paceLevel === p ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                  <RadioGroupItem value={p} /><span className="text-sm font-medium capitalize">{p === 'any' ? 'Any pace' : p}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div><Label>When do you like to move?</Label>
            <RadioGroup value={schedule} onValueChange={setSchedule} className="mt-2 grid grid-cols-3 gap-2">
              {['morning', 'afternoon', 'evening'].map(s => (
                <Label key={s} className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-colors ${schedule === s ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                  <RadioGroupItem value={s} /><span className="text-sm font-medium capitalize">{s}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div><Label htmlFor="bio">Bio <span className="text-muted-foreground">(optional)</span></Label><Textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell others about yourself..." className="mt-1.5" rows={2} /></div>
        </div>
        <Button size="lg" className="w-full mt-8 rounded-full font-semibold" onClick={handleSubmit} disabled={!name || !email || loading}>
          {loading ? 'Setting up...' : 'Start Running Together'}
        </Button>
      </motion.div>
    </div>
  )
}