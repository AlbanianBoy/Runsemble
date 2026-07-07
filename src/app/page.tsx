'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { OnboardingWelcome, OnboardingProfile, OnboardingVerifyEmail, OnboardingLogin, OnboardingRuns, toUserProfile } from '@/components/runsemble/onboarding'
import { FeedTab } from '@/components/runsemble/feed-tab'
import { MapTab } from '@/components/runsemble/map-tab'
import { GroupsTab } from '@/components/runsemble/groups-tab'
import { ProfileTab } from '@/components/runsemble/profile-tab'
import { BottomNav } from '@/components/runsemble/bottom-nav'
import { RunTracker } from '@/components/runsemble/run-tracker'
import { NotificationsSheet } from '@/components/runsemble/notifications-sheet'
import { DmSheet } from '@/components/runsemble/dm-sheet'
import { getAvatarColor, getInitials } from '@/components/runsemble/helpers'

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export default function Home() {
  const {
    onboardingStep,
    activeTab,
    currentUser,
    _hydrated,
    unreadCount,
    setNotificationsOpen,
    setActiveTab,
    setCurrentUser,
    setOnboardingStep,
    runTrackerOpen,
  } = useRunsembleStore()

  // Restore a login session: if local state has no user but a valid session
  // cookie exists, pick up where the account left off (e.g. new device,
  // cleared storage).
  useEffect(() => {
    if (!_hydrated || currentUser) return
    let cancelled = false
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.user) {
          setCurrentUser(toUserProfile(data.user))
          setOnboardingStep('done')
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [_hydrated, currentUser, setCurrentUser, setOnboardingStep])

  // Don't render until Zustand has rehydrated from localStorage
  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">Runsemble</h1>
          <p className="text-sm text-muted-foreground mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (onboardingStep === 'welcome') return <OnboardingWelcome />
  if (onboardingStep === 'profile') return <OnboardingProfile />
  if (onboardingStep === 'verify' && currentUser) return <OnboardingVerifyEmail />
  if (onboardingStep === 'login') return <OnboardingLogin />
  if (onboardingStep === 'runs' && currentUser) return <OnboardingRuns />
  if (!currentUser) return <OnboardingWelcome />

  const renderTab = () => {
    switch (activeTab) {
      case 'feed': return <FeedTab />
      case 'map': return <MapTab />
      case 'hotspots': return <MapTab /> // legacy tab — Runs now live inside Explore
      case 'groups': return <GroupsTab />
      case 'profile': return <ProfileTab />
      default: return <FeedTab />
    }
  }

  return (
    <div className="min-h-screen rs-app-bg">
      <div className="max-w-md mx-auto min-h-screen flex flex-col relative">
        <header className="sticky top-0 z-40 glass border-b px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold tracking-tight text-primary">Runsemble</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 relative"
                onClick={() => setNotificationsOpen(true)}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full px-1">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
              <button onClick={() => setActiveTab('profile')} aria-label="Your profile">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={`text-xs text-white ${getAvatarColor(currentUser.name)}`}>
                    {getInitials(currentUser.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 pt-4 pb-24">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} variants={pageVariants} initial="initial" animate="animate" exit="exit">
              {renderTab()}
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>

      {/* Global overlays */}
      <NotificationsSheet />
      <DmSheet />
      <AnimatePresence>
        {runTrackerOpen && <RunTracker />}
      </AnimatePresence>
    </div>
  )
}
