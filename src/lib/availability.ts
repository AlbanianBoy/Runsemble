// ─── Availability windows ─────────────────────────────────────────────────────
// "Available now" vs "free later today". At low user density, scheduling is
// what makes meetups happen: fifteen users are rarely free at the same moment,
// but they can all see that Maya is free at 18:30.
//
// A scheduled window auto-activates client-side for SCHEDULED_WINDOW_MIN
// minutes once its start time arrives — no server cron required.

export const AVAILABLE_NOW_MINUTES = 45
export const SCHEDULED_WINDOW_MIN = 60

export interface AvailabilityLike {
  isAvailable: boolean
  availableFrom?: string | null
}

/** Live on the map right now — explicitly available, or a scheduled slot that has started. */
export function isAvailableNow(u: AvailabilityLike, now: Date = new Date()): boolean {
  if (u.isAvailable) return true
  if (!u.availableFrom) return false
  const from = new Date(u.availableFrom).getTime()
  if (Number.isNaN(from)) return false
  return from <= now.getTime() && now.getTime() < from + SCHEDULED_WINDOW_MIN * 60_000
}

/** Scheduled for later — shown in the "Coming up" strip. */
export function isComingUp(u: AvailabilityLike, now: Date = new Date()): boolean {
  if (!u.availableFrom) return false
  const from = new Date(u.availableFrom).getTime()
  return !Number.isNaN(from) && from > now.getTime()
}

/** "18:30"-style label for a scheduled slot. */
export function availableFromLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
