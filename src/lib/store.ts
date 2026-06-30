import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TabType = 'feed' | 'map' | 'hotspots' | 'groups' | 'profile'
export type OnboardingStep = 'welcome' | 'profile' | 'complete' | 'done'
export type PaceLevel = 'beginner' | 'intermediate' | 'advanced' | 'any'
export type SchedulePreference = 'morning' | 'afternoon' | 'evening' | 'anytime'
export type RankTier = 'Starter' | 'Jogger' | 'Pacer' | 'Regular' | 'Runsemble' | 'Elite Ensemble'

interface UserProfile {
  id: string
  name: string
  email: string
  avatar: string | null
  bio: string | null
  city: string
  preferredSport: string
  paceLevel: PaceLevel
  schedulePreference: SchedulePreference
  xp: number
  streak: number
  longestStreak: number
  totalRuns: number
  totalPeopleRunWith: number
  isAvailable: boolean
  privacyVisible: boolean
  onboardingComplete: boolean
}

interface RunsembleState {
  // Hydration
  _hydrated: boolean

  // Onboarding
  onboardingStep: OnboardingStep
  setOnboardingStep: (step: OnboardingStep) => void

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

  // Profile view
  profileView: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings'
  setProfileView: (view: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings') => void

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

      unreadCount: 3,
      setUnreadCount: (count) => set({ unreadCount: count }),

      profileView: 'main',
      setProfileView: (view) => set({ profileView: view }),

      hotspotFilter: 'today',
      setHotspotFilter: (filter) => set({ hotspotFilter: filter }),
    }),
    {
      name: 'runsemble-store',
      onRehydrateStorage: () => () => {
        // Use setState to ensure React re-renders
        setTimeout(() => {
          useRunsembleStore.setState({ _hydrated: true })
        }, 0)
      },
    }
  )
)

// Rank calculation
export function getRankFromXP(xp: number): { tier: RankTier; icon: string; minXP: number; nextTierXP: number } {
  const ranks = [
    { tier: 'Starter' as RankTier, icon: '🌱', minXP: 0, nextTierXP: 100 },
    { tier: 'Jogger' as RankTier, icon: '👟', minXP: 100, nextTierXP: 300 },
    { tier: 'Pacer' as RankTier, icon: '⚡', minXP: 300, nextTierXP: 600 },
    { tier: 'Regular' as RankTier, icon: '🔥', minXP: 600, nextTierXP: 1000 },
    { tier: 'Runsemble' as RankTier, icon: '🏅', minXP: 1000, nextTierXP: 2000 },
    { tier: 'Elite Ensemble' as RankTier, icon: '👑', minXP: 2000, nextTierXP: 99999 },
  ]

  for (let i = ranks.length - 1; i >= 0; i--) {
    if (xp >= ranks[i].minXP) {
      return {
        ...ranks[i],
        nextTierXP: i < ranks.length - 1 ? ranks[i + 1].minXP : ranks[i].nextTierXP,
      }
    }
  }
  return ranks[0]
}
