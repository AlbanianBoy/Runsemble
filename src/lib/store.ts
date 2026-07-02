import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getRankFromXP, type RankTier } from './ranks'

// Re-exported so existing `@/lib/store` imports keep working while the rank
// logic itself lives in one place (src/lib/ranks.ts).
export { getRankFromXP }
export type { RankTier }

export type TabType = 'feed' | 'map' | 'hotspots' | 'groups' | 'profile'
export type OnboardingStep = 'welcome' | 'profile' | 'complete' | 'done'
export type PaceLevel = 'beginner' | 'intermediate' | 'advanced' | 'any'
export type SchedulePreference = 'morning' | 'afternoon' | 'evening' | 'anytime'

interface UserProfile {
  id: string
  name: string
  email: string
  avatar: string | null
  bio: string | null
  city: string
  lat?: number | null
  lng?: number | null
  preferredSport: string
  paceLevel: PaceLevel
  schedulePreference: SchedulePreference
  xp: number
  streak: number
  longestStreak: number
  totalRuns: number
  totalPeopleRunWith: number
  totalDistanceKm: number
  totalDurationSec: number
  isAvailable: boolean
  privacyVisible: boolean
  onboardingComplete: boolean
}

/** Context passed when opening the run tracker (solo, or tied to a run/group). */
export interface RunContext {
  hotspotId?: string
  groupId?: string
  label?: string
}

interface RunsembleState {
  // Hydration
  _hydrated: boolean

  // Onboarding
  onboardingStep: OnboardingStep
  setOnboardingStep: (step: OnboardingStep) => void
  onboardingAnswer: string | null
  setOnboardingAnswer: (answer: string) => void

  // Navigation
  activeTab: TabType
  setActiveTab: (tab: TabType) => void

  // User
  currentUser: UserProfile | null
  setCurrentUser: (user: UserProfile) => void
  updateProfile: (data: Partial<UserProfile>) => void

  // Availability
  isAvailable: boolean
  availableMinutes: number
  setAvailability: (available: boolean, minutes?: number) => void

  // Group view
  selectedGroupId: string | null
  setSelectedGroupId: (id: string | null) => void
  groupView: 'list' | 'detail' | 'chat' | 'create'
  setGroupView: (view: 'list' | 'detail' | 'chat' | 'create') => void

  // Notifications count
  unreadCount: number
  setUnreadCount: (count: number) => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void

  // Run tracker
  runTrackerOpen: boolean
  runContext: RunContext | null
  openRunTracker: (ctx?: RunContext) => void
  closeRunTracker: () => void

  // Direct messages
  dmPartner: { id: string; name: string } | null
  openDm: (partner: { id: string; name: string }) => void
  closeDm: () => void

  // Profile view
  profileView: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings' | 'leaderboard' | 'runs' | 'challenges' | 'buddies'
  setProfileView: (view: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings' | 'leaderboard' | 'runs' | 'challenges' | 'buddies') => void

  // Hotspot filter
  hotspotFilter: 'all' | 'today' | 'this-week'
  setHotspotFilter: (filter: 'all' | 'today' | 'this-week') => void
}

export const useRunsembleStore = create<RunsembleState>()(
  persist(
    (set) => ({
      _hydrated: false,
      onboardingStep: 'welcome',
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      onboardingAnswer: null,
      setOnboardingAnswer: (answer) => set({ onboardingAnswer: answer }),

      activeTab: 'feed',
      setActiveTab: (tab) => set({ activeTab: tab }),

      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      updateProfile: (data) =>
        set((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, ...data }
            : null,
        })),

      isAvailable: false,
      availableMinutes: 45,
      setAvailability: (available, minutes = 45) =>
        set({ isAvailable: available, availableMinutes: minutes }),

      selectedGroupId: null,
      setSelectedGroupId: (id) => set({ selectedGroupId: id }),
      groupView: 'list',
      setGroupView: (view) => set({ groupView: view }),

      unreadCount: 0,
      setUnreadCount: (count) => set({ unreadCount: count }),
      notificationsOpen: false,
      setNotificationsOpen: (open) => set({ notificationsOpen: open }),

      runTrackerOpen: false,
      runContext: null,
      openRunTracker: (ctx = {}) => set({ runTrackerOpen: true, runContext: ctx }),
      closeRunTracker: () => set({ runTrackerOpen: false, runContext: null }),

      dmPartner: null,
      openDm: (partner) => set({ dmPartner: partner }),
      closeDm: () => set({ dmPartner: null }),

      profileView: 'main',
      setProfileView: (view) => set({ profileView: view }),

      hotspotFilter: 'today',
      setHotspotFilter: (filter) => set({ hotspotFilter: filter }),
    }),
    {
      name: 'runsemble-store',
      // Only persist durable state — transient UI flags (open sheets, the run
      // tracker) should always start closed on load.
      partialize: (state) => ({
        onboardingStep: state.onboardingStep,
        currentUser: state.currentUser,
        activeTab: state.activeTab,
        isAvailable: state.isAvailable,
        availableMinutes: state.availableMinutes,
        hotspotFilter: state.hotspotFilter,
      }),
      onRehydrateStorage: () => () => {
        // Use setState to ensure React re-renders
        setTimeout(() => {
          useRunsembleStore.setState({ _hydrated: true })
        }, 0)
      },
    }
  )
)

