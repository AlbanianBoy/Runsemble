// ─── Run formatting helpers ───────────────────────────────────────────────────
// Shared between the live run tracker and the run history views.

/** Seconds → "H:MM:SS" or "M:SS". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Pace in seconds-per-km → "5:30 /km". Returns "—" when there's no distance. */
export function formatPaceLabel(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

/** Compute average pace (sec per km) from distance + duration. */
export function paceFromRun(distanceKm: number, durationSec: number): number {
  return distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0
}

/** Human date like "Jul 1" for run history rows. */
export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
