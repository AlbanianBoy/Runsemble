'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { OnboardingWelcome, OnboardingProfile } from '@/components/runsemble/onboarding'
import { FeedTab } from '@/components/runsemble/feed-tab'
import { MapTab } from '@/components/runsemble/map-tab'
import { HotspotsTab } from '@/components/runsemble/hotspots-tab'
import { GroupsTab } from '@/components/runsemble/groups-tab'
import { ProfileTab } from '@/components/runsemble/profile-tab'
import { BottomNav } from '@/components/runsemble/bottom-nav'
import { getAvatarColor, getInitials } from '@/components/runsemble/helpers'

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export default function Home() {
  const { onboardingStep, activeTab, currentUser, _hydrated } = useRunsembleStore()

  // Don't render until Zustand has rehydrated from localStorage
  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gradient-brand">Runsemble</h1>
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (onboardingStep === 'welcome') return <OnboardingWelcome />
  if (onboardingStep === 'profile') return <OnboardingProfile />
  if (!currentUser) return <OnboardingWelcome />

  const renderTab = () => {
    switch (activeTab) {
      case 'feed': return <FeedTab />
      case 'map': return <MapTab />
      case 'hotspots': return <HotspotsTab />
      case 'groups': return <GroupsTab />
      case 'profile': return <ProfileTab />
      default: return <FeedTab />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto min-h-screen flex flex-col relative">
        <header className="sticky top-0 z-40 glass border-b border-border/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gradient-brand">Runsemble</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 relative">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={`text-xs text-white ${getAvatarColor(currentUser.name)}`}>
                  {getInitials(currentUser.name)}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 pt-4 pb-20">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
