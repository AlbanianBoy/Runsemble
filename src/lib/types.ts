// ─── Shared domain types ──────────────────────────────────────────────────────
// Typed contracts for what the API actually returns, so components stop reaching
// for `any` on every fetch. These mirror the Prisma models plus the computed
// fields the route handlers attach.

import type { RankTier } from './ranks'

export type { RankTier }

export interface ApiUser {
  id: string
  name: string
  email: string
  avatar: string | null
  bio: string | null
  city: string
  preferredSport: string
  paceLevel: string
  schedulePreference: string
  xp: number
  streak: number
  longestStreak: number
  totalRuns: number
  totalPeopleRunWith: number
  totalDistanceKm: number
  totalDurationSec: number
  isAvailable: boolean
  availableFrom?: string | null // scheduled "free later today" slot
  availableUntil?: string | null
  privacyVisible: boolean
  lat: number | null
  lng: number | null
  gender?: string | null
  verified?: boolean
}

export interface HotspotParticipantUser {
  id: string
  name: string
  avatar: string | null
  paceLevel: string
}

export interface HotspotParticipant {
  userId: string
  user: HotspotParticipantUser
}

/** A hotspot as returned by /api/hotspots — Prisma fields + computed meta. */
export interface ApiHotspot {
  id: string
  name: string
  description: string | null
  location: string
  lat: number
  lng: number
  sportType: string
  distanceKm: number
  paceRange: string
  startTime: string
  recurringIntervalMin: number
  isOfficial?: boolean
  audience?: string // all | women | beginner
  scheduleLabel?: string | null
  createdBy: string | null
  participants?: HotspotParticipant[]
  participantCount: number
  participantNames: string[]
  minutesUntil: number
}

export interface ApiBadge {
  id: string
  badgeType: string
  title: string
  description: string
  icon: string
}

export interface FeedAuthor {
  id: string
  name: string
  avatar: string | null
  paceLevel: string
  streak: number
  xp: number
  // M56: needed for TrustBadge on feed cards — already in the public user
  // projection so no extra join is required; just select them in the feed query.
  totalRuns: number
  totalPeopleRunWith: number
}

export interface ApiFeedPost {
  id: string
  authorId: string
  groupId: string | null
  content: string
  imageUrl: string | null
  postType: string
  likes: number
  comments: number
  likedByMe?: boolean
  createdAt: string
  author?: FeedAuthor
  group?: { id: string; name: string; coverImage: string | null } | null
  /** Present when the post shares a tracked run — rendered as a route card. */
  runSession?: {
    distanceKm: number
    durationSec: number
    avgPaceSecPerKm: number
    path: string | null
  } | null
}

export interface ApiComment {
  id: string
  postId: string
  content: string
  createdAt: string
  author?: { id: string; name: string; avatar: string | null }
}

export interface LikeResponse {
  liked: boolean
  likes: number
}
export interface CommentsResponse {
  comments: ApiComment[]
}

// ─── Notifications ──────────────────────────────────────────────────────────
export interface ApiNotification {
  id: string
  type: string
  title: string
  body: string | null
  icon: string | null
  entityId: string | null
  read: boolean
  createdAt: string
  actor?: { id: string; name: string; avatar: string | null } | null
}
export interface NotificationsResponse {
  notifications: ApiNotification[]
  unread: number
}

// ─── Leaderboard ────────────────────────────────────────────────────────────
export type LeaderboardMetric = 'xp' | 'distance' | 'streak' | 'runs' | 'buddies'
/** Rolling time window. `week`/`month` rank on runs inside the window; `all` on lifetime totals. */
export type LeaderboardWindow = 'all' | 'week' | 'month'
export interface LeaderboardEntry {
  id: string
  name: string
  avatar: string | null
  city: string
  /** Lifetime totals — always present, and still what the rank/tier badge is read from. */
  xp: number
  streak: number
  totalRuns: number
  totalDistanceKm: number
  totalPeopleRunWith: number
  paceLevel: string
  position: number
  /** Totals earned inside the window. Set on week/month boards only, absent on all-time. */
  windowXp?: number
  windowRuns?: number
  windowDistanceKm?: number
}
export interface LeaderboardResponse {
  /** The metric actually served — may differ from the request when a metric has no windowed board. */
  metric: LeaderboardMetric
  window: LeaderboardWindow
  entries: LeaderboardEntry[]
  /** The viewer's own row + true rank when they fall outside the top list; null if in it. */
  viewer?: LeaderboardEntry | null
}

// ─── Run sessions ───────────────────────────────────────────────────────────
export interface ApiRunSession {
  id: string
  distanceKm: number
  durationSec: number
  avgPaceSecPerKm: number
  calories: number
  companions: number
  xpEarned: number
  sportType: string
  note: string | null
  path?: string | null
  splits?: string | null
  startedAt: string
  endedAt: string
  hotspot?: { id: string; name: string } | null
  group?: { id: string; name: string } | null
}
export interface RunsResponse {
  runs: ApiRunSession[]
}
export interface RunBadgeSpec {
  badgeType: string
  title: string
  description: string
  icon: string
}
export interface RunSaveResponse {
  session: ApiRunSession
  xp?: XpAward | null
  badgesEarned: RunBadgeSpec[]
  streak: { streak: number; longestStreak: number; incremented: boolean; usedGrace: boolean }
  newBuddyCount: number
}

// ─── Buddies ────────────────────────────────────────────────────────────────
export interface BuddyUser {
  id: string
  name: string
  avatar: string | null
  city: string
  paceLevel: string
  xp: number
  streak: number
  isAvailable: boolean
}
export interface BuddiesResponse {
  buddies: BuddyUser[]
}

// ─── Direct messages ──────────────────────────────────────────────────────────
export interface ApiDirectMessage {
  id: string
  senderId: string
  recipientId: string | null
  content: string
  read: boolean
  createdAt: string
}
export interface DmConversation {
  partner: { id: string; name: string; avatar: string | null }
  lastMessage: string
  createdAt: string
  unread: number
}
export interface ConversationsResponse {
  conversations: DmConversation[]
  totalUnread: number
}
export interface DmThreadResponse {
  messages: ApiDirectMessage[]
}

// ─── Run lobby ────────────────────────────────────────────────────────────────
export interface LobbyParticipant {
  userId: string
  status: string // joined | here | completed | cancelled
  checkedInAt: string | null
  user: { id: string; name: string; avatar: string | null; paceLevel: string }
}
export interface LobbyResponse {
  /** The run context — a hotspot, or a group (then startTime/lat/lng are null). */
  hotspot: {
    id: string
    name: string
    location: string
    startTime: string | null
    lat: number | null
    lng: number | null
  }
  participants: LobbyParticipant[]
  lobbyStartedAt: string | null
}
export interface LobbyActionResponse {
  lobby: LobbyResponse
  xp?: XpAward | null
}

// ─── Challenges ───────────────────────────────────────────────────────────────
export interface ApiChallenge {
  id: string
  title: string
  description: string | null
  metric: 'distance' | 'runs' | 'buddies'
  goal: number
  scope: string
  groupId: string | null
  icon: string
  startsAt: string
  endsAt: string
  participantCount: number
  joined: boolean
  myProgress: number
  totalProgress: number
}
export interface ChallengesResponse {
  challenges: ApiChallenge[]
}

/** Result of an XP award, surfaced to the client so it can celebrate. */
export interface XpAward {
  awarded: number
  reason: string
  newXp: number
  rankBefore: RankTier
  rankAfter: RankTier
  rankedUp: boolean
}

// ─── API envelope shapes ──────────────────────────────────────────────────────
export interface UsersResponse {
  users: ApiUser[]
}
export interface HotspotsResponse {
  hotspots: ApiHotspot[]
}
export interface HotspotResponse {
  hotspot: ApiHotspot
  xp?: XpAward | null
  badgeEarned?: ApiBadge | null
}
export interface FeedResponse {
  posts: ApiFeedPost[]
  /** Pass as `?cursor=` for the next page. null means this was the last one. */
  nextCursor: string | null
}
export interface BadgesResponse {
  badges: ApiBadge[]
}

// ─── Groups ───────────────────────────────────────────────────────────────────
export interface ApiGroupMember {
  userId: string
  role: string
  user?: { name: string } | null
}
export interface ApiGroup {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  city: string
  memberCount: number
  totalKmThisWeek: number
  isMember?: boolean
  totalMessages?: number
  members?: ApiGroupMember[]
}
export interface ApiGroupMessage {
  id: string
  senderId: string
  content: string
  createdAt: string
  sender?: { name: string } | null
}
export interface GroupsResponse {
  groups: ApiGroup[]
  /** Cursor for the next page of Discover; null when there are no more. */
  nextCursor?: string | null
  /** The city Discover was narrowed to, or null when it wasn't (search, or no city on file). */
  scopedToCity?: string | null
}
export interface GroupResponse {
  group: ApiGroup
}
export interface GroupMessagesResponse {
  messages: ApiGroupMessage[]
}
