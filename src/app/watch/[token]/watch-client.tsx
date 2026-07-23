'use client'

// ─── The watch page, client side ─────────────────────────────────────────────
// Opened by someone who is worried, on a cold phone browser, with no account and
// nothing installed. That is the entire design brief. Above the fold it answers
// three questions: where is the runner, how long ago was that, and are they OK.
//
// It talks to the PUBLIC endpoint with a plain fetch — never the app's apiGet,
// which reads the login session and would bounce a logged-out watcher. Polling
// is TanStack Query's refetchInterval, which pauses on its own when the tab is
// backgrounded (a phone in a pocket must not hammer the server) and refetches on
// return. A failed refetch keeps the last good frame on screen rather than
// flashing an error at someone watching a live run.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { formatClock } from '@/lib/run'
import type { PublicRunShare } from '@/lib/run-share'

const WatchMap = dynamic(() => import('@/components/runsemble/watch-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-muted animate-pulse" />,
})

// A 404 is data, not an error: the query returns it so it renders the "no longer
// active" state instead of retrying a link that will never come back.
type ShareResult = { kind: 'ok'; share: PublicRunShare } | { kind: 'notfound' }

/** "just now" / "12s ago" / "4m ago" / "1h 3m ago" — never a raw timestamp. */
function ago(fromIso: string, now: number): string {
  const sec = Math.max(0, Math.round((now - Date.parse(fromIso)) / 1000))
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m ago`
}

/** Clock time like "21:43" for the expiry / alarm lines. */
function clockTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const STATUS_COPY: Record<PublicRunShare['status'], { label: string; tone: 'live' | 'stale' | 'over' }> = {
  live: { label: 'Live', tone: 'live' },
  stale: { label: 'Signal lost', tone: 'stale' },
  ended: { label: 'This run has ended', tone: 'over' },
  expired: { label: 'This link has expired', tone: 'over' },
  revoked: { label: 'Sharing was turned off', tone: 'over' },
}

export function WatchClient({ token }: { token: string }) {
  const { data, isError, isPending } = useQuery<ShareResult>({
    queryKey: ['run-share', token],
    queryFn: async () => {
      const res = await fetch(`/api/run-shares/${encodeURIComponent(token)}`, { cache: 'no-store' })
      if (res.status === 404) return { kind: 'notfound' }
      if (!res.ok) throw new Error(`run-share fetch failed: ${res.status}`)
      return { kind: 'ok', share: (await res.json()) as PublicRunShare }
    },
    // Ten seconds while visible; TanStack pauses it in the background by default.
    refetchInterval: 10_000,
    staleTime: 0,
  })

  // A one-second clock so "12s ago" ticks up between refetches.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col px-4 py-5 gap-4">
        <header className="flex items-center justify-between">
          <span className="font-extrabold tracking-tight text-lg">Runsemble</span>
          <span className="text-xs text-muted-foreground">Live run</span>
        </header>

        {data?.kind === 'ok' ? (
          <Loaded share={data.share} now={now} />
        ) : data?.kind === 'notfound' ? (
          <Centered
            title="This link is no longer active"
            body="The run may have finished, or the person may have stopped sharing. There's nothing to see here anymore."
          />
        ) : isPending ? (
          <p className="text-sm text-muted-foreground mt-8 text-center">Loading…</p>
        ) : isError ? (
          <Centered
            title="Couldn't load this run"
            body="Check your connection and try again in a moment."
          />
        ) : null}
      </div>

      <footer className="text-center text-xs text-muted-foreground pb-5">
        <a href="/" className="hover:underline underline-offset-4">What is Runsemble?</a>
      </footer>
    </main>
  )
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-2">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground max-w-xs">{body}</p>
    </div>
  )
}

function Loaded({ share, now }: { share: PublicRunShare; now: number }) {
  const status = STATUS_COPY[share.status]
  const initial = (share.runner.name.trim()[0] ?? '?').toUpperCase()

  return (
    <>
      {/* SOS — the loudest thing on the page. role="alert" so a screen reader
          announces it the instant it appears. No looping animation (house rule). */}
      {share.sos && (
        <div role="alert" className="rounded-2xl border-2 border-red-500 bg-red-500/10 px-4 py-3">
          <p className="font-extrabold text-red-600 dark:text-red-400 tracking-wide">SOS RAISED</p>
          {share.sosAt && (
            <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
              {share.runner.name} raised an alarm at {clockTime(share.sosAt)} ({ago(share.sosAt, now)}).
            </p>
          )}
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            If you can&apos;t reach them, call your local emergency number — <strong>112</strong> in Europe.
          </p>
        </div>
      )}

      {/* Who + status */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-lg shrink-0 bg-cover bg-center"
          style={share.runner.avatar ? { backgroundImage: `url(${share.runner.avatar})` } : undefined}
          aria-hidden
        >
          {share.runner.avatar ? '' : initial}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{share.runner.name}</p>
          <p className="text-sm flex items-center gap-1.5">
            {status.tone === 'live' && <span className="w-2 h-2 rounded-full bg-teal-500" />}
            {status.tone === 'stale' && <span className="w-2 h-2 rounded-full bg-slate-400" />}
            <span
              className={
                status.tone === 'live'
                  ? 'text-teal-600 dark:text-teal-400 font-medium'
                  : status.tone === 'stale'
                    ? 'text-slate-500'
                    : 'text-muted-foreground'
              }
            >
              {status.label}
            </span>
          </p>
        </div>
      </div>

      {/* Map — present whenever there's a position to show (live or stale). */}
      {share.position ? (
        <div className="rounded-2xl overflow-hidden h-72 border border-border">
          <WatchMap
            lat={share.position.lat}
            lng={share.position.lng}
            accuracyM={share.position.accuracyM}
            stale={share.status === 'stale'}
          />
        </div>
      ) : (
        <div className="rounded-2xl h-40 border border-border grid place-items-center text-sm text-muted-foreground">
          No location to show yet
        </div>
      )}

      {/* Freshness — the second question. aria-live so it's announced as it updates. */}
      <p className="text-sm text-muted-foreground text-center" aria-live="polite">
        {share.position
          ? share.status === 'stale'
            ? `Last seen ${ago(share.position.at, now)} — waiting for a fresh signal`
            : `Updated ${ago(share.position.at, now)}`
          : 'Waiting for the first location…'}
      </p>

      {/* Run stats */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Distance" value={`${share.distanceKm.toFixed(2)} km`} />
        <Stat label="Time" value={formatClock(share.durationSec)} />
      </div>

      <p className="text-xs text-muted-foreground text-center mt-1">
        This link expires at {clockTime(share.expiresAt)}.
      </p>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
