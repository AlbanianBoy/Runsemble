// ─── Audience badge ─────────────────────────────────────────────────────────
// Shows who a run is for (women-only, beginner-friendly). Part of the safety /
// inclusivity surface.
export function AudienceBadge({ audience }: { audience?: string }) {
  if (!audience || audience === 'all') return null
  const map: Record<string, { label: string; cls: string }> = {
    women: { label: '♀ Women only', cls: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300' },
    beginner: { label: 'Beginners', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  }
  const m = map[audience]
  if (!m) return null
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
}

// ─── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-orange-500',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-rose-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-yellow-600',
  'bg-red-500',
  'bg-cyan-600',
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Format a pace string like "5:30" given minutes per km */
export function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Format minutes into a human-readable string: "1h 30m" or "45m" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/** Format distance in km with appropriate precision */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`
}

/** Truncate text to maxLen characters, adding ellipsis if needed */
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '…'
}

/** Format a count for compact display: 1234 → "1.2k" */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toString()
}

/** Get a relative time label like "in 30 min" or "2h ago" */
export function relativeTimeLabel(date: Date, future = false): string {
  const now = Date.now()
  const diff = future
    ? new Date(date).getTime() - now
    : now - new Date(date).getTime()
  const minutes = Math.floor(Math.abs(diff) / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ${future ? 'from now' : 'ago'}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${future ? 'from now' : 'ago'}`
  const days = Math.floor(hours / 24)
  return `${days}d ${future ? 'from now' : 'ago'}`
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

/** Return a contrasting text color class for a given background brightness (0-1) */
export function contrastColor(bgBrightness: number): string {
  return bgBrightness > 0.6 ? 'text-foreground' : 'text-white'
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Delay execution by ms (useful in animations) */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Capitalize the first letter of a string */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Generate a deterministic color from a string (for tags, categories, etc.) */
const TAG_PALETTE = [
  'bg-orange-100 text-orange-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
  'bg-violet-100 text-violet-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
]

export function getTagColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}