import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getRankFromXP, type RankTier } from './ranks'
import type {
  PaceLevel as PaceLevelValue,
  SchedulePreference as ScheduleSlotValue,
} from './enums'

export { getRankFromXP }
export type { RankTier }

export type TabType = 'feed' | 'map' | 'hotspots' | 'groups' | 'profile'
export type OnboardingStep = 'welcome' | 'profile' | 'verify' | 'login' | 'runs' | 'complete' | 'done'
// Pinned to src/lib/enums.ts, which mirrors the database. These used to be
// written out by hand here, and drifted: the enum lacked 'any' while this type
// had it, so "Any pace" typechecked in the UI and 500'd at the database.
// enums.ts holds plain literals and imports no Prisma client, so this costs the
// browser bundle nothing.
export type PaceLevel = PaceLevelValue
// Multi-select: stored as a string[] in the client; serialised as a
// comma-separated string when sent to the server (e.g. "morning,evening").
export type ScheduleSlot = ScheduleSlotValue
export type SchedulePreference = ScheduleSlot[]

export interface UserProfile {
  id: string
  name: string
  email: string
  emailVerified: boolean
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
  availableFrom?: string | null
  availableUntil?: string | null
  privacyVisible: boolean
  analyticsConsent: boolean
  onboardingComplete: boolean
}

export interface RunContext {
  hotspotId?: string
  groupId?: string
  label?: string
}

interface RunsembleState {
  _hydrated: boolean

  onboardingStep: OnboardingStep
  setOnboardingStep: (step: OnboardingStep) => void
  onboardingAnswer: string | null
  setOnboardingAnswer: (answer: string) => void

  activeTab: TabType
  setActiveTab: (tab: TabType) => void

  currentUser: UserProfile | null
  setCurrentUser: (user: UserProfile) => void
  updateProfile: (data: Partial<UserProfile>) => void

  isAvailable: boolean
  availableMinutes: number
  setAvailability: (available: boolean, minutes?: number) => void

  selectedGroupId: string | null
  setSelectedGroupId: (id: string | null) => void
  groupView: 'list' | 'detail' | 'chat' | 'create'
  setGroupView: (view: 'list' | 'detail' | 'chat' | 'create') => void

  unreadCount: number
  setUnreadCount: (count: number) => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void

  // Total unread DM count (shown as badge on Groups tab)
  unreadDmCount: number
  setUnreadDmCount: (count: number) => void

  runTrackerOpen: boolean
  runContext: RunContext | null
  openRunTracker: (ctx?: RunContext) => void
  closeRunTracker: () => void

  dmPartner: { id: string; name: string } | null
  openDm: (partner: { id: string; name: string }) => void
  closeDm: () => void

  profileView: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings' | 'leaderboard' | 'runs' | 'challenges' | 'buddies'
  setProfileView: (view: 'main' | 'edit' | 'achievements' | 'badges' | 'xp' | 'settings' | 'leaderboard' | 'runs' | 'challenges' | 'buddies') => void

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

      // The map is home — the app opens on the core loop (who's free to run near
      // me, and a one-tap way to say I am), not on the feed.
      activeTab: 'map',
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

      unreadDmCount: 0,
      setUnreadDmCount: (count) => set({ unreadDmCount: count }),

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
      partialize: (state) => ({
        onboardingStep: state.onboardingStep,
        currentUser: state.currentUser,
        activeTab: state.activeTab,
        isAvailable: state.isAvailable,
        availableMinutes: state.availableMinutes,
        hotspotFilter: state.hotspotFilter,
      }),
      onRehydrateStorage: () => () => {
        setTimeout(() => {
          useRunsembleStore.setState({ _hydrated: true })
        }, 0)
      },
    }
  )
)
