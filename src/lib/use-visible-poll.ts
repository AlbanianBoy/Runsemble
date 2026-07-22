'use client'

// ─── useVisiblePoll ───────────────────────────────────────────────────────────
// Turns a polling interval off while the tab (or the app) is hidden.
//
// Every polled query in this app is a serverless function invocation on a timer,
// and those timers don't stop when the user switches tabs, locks the phone, or
// backgrounds the app. A lobby left open on a forgotten tab was billing us a
// round-trip every 3 seconds, forever, to re-render a screen nobody was looking
// at — at scale that background traffic dominates the function bill, and none of
// it reaches a human eye.
//
// This is deliberately NOT `refetchIntervalInBackground`. That option governs
// window *focus* — an unfocused-but-visible window still legitimately shows the
// data, so pausing on focus loss would break split-screen and second-monitor use.
// Visibility is the honest signal for "this pixel cannot be seen".
//
// Coming back is cheap: `refetchOnWindowFocus` (on by default, and our 30s
// staleTime means anything paused for a while counts as stale) fires an
// immediate refetch when the user returns, so the interval restarting from zero
// is never what the user waits on.

import { useCallback, useRef, useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void): () => void {
  document.addEventListener('visibilitychange', onStoreChange)
  return () => document.removeEventListener('visibilitychange', onStoreChange)
}

function getSnapshot(): boolean {
  return document.visibilityState === 'visible'
}

// The server has no `document`, and neither does the first (hydrating) client
// render — assuming "visible" there keeps markup identical on both sides. If the
// tab really was hidden, the subscription corrects it the moment it attaches.
function getServerSnapshot(): boolean {
  return true
}

/**
 * @param ms  the interval you'd have passed to `refetchInterval`
 * @returns   `ms` while the document is visible, `false` while it's hidden —
 *            exactly the shape TanStack Query's `refetchInterval` accepts, where
 *            `false` means "don't poll".
 *
 * Call it unconditionally at the top level like any hook. To keep an existing
 * condition, compose the result rather than calling this behind the condition:
 * `refetchInterval: chatIsOpen ? poll : false`.
 */
export function useVisiblePoll(ms: number): number | false {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return visible ? ms : false
}

// ─── useIdleBackoffPoll ───────────────────────────────────────────────────────
// A visibility-gated poll that slows down while nothing is coming back.
//
// For the two background polls — the notification bell and the conversation
// list — the fast interval only earns its keep in the seconds after something
// actually happens. The rest of the time it re-asks a question whose answer has
// not changed since the last time it asked, and on serverless every one of those
// is a function invocation and a database query. The bell alone is over half the
// steady-state request rate of a signed-in user, because unlike every other poll
// in the app it runs on every screen rather than one.
//
// It is a fallback, too, not the primary channel: an arriving push already
// invalidates these queries (see usePushNotifications), so on native the poll
// exists to cover a missed or unpermitted push.
//
// The rule is deliberately asymmetric — slow to back off, instant to recover.
// Any change at all resets to the base interval, so a quiet hour costs a third
// of the requests and the first thing that happens is still seen at full speed.
//
// Detecting "nothing changed" leans on TanStack Query's structural sharing: when
// a refetch produces deeply-equal data it keeps the previous object reference.
// So a `dataUpdatedAt` that moved while `data` kept its identity means a fetch
// happened and brought back nothing new — which is exactly the case worth
// backing off from.

const BACKOFF_AFTER = 3 // quiet polls before slowing down
const BACKOFF_FACTOR = 3

/** The shape of the bit of TanStack's Query object this needs. */
interface PolledQuery {
  state: { data: unknown; dataUpdatedAt: number }
}

/** What the hook carries between calls. Mutated in place — it lives in a ref. */
export interface BackoffState {
  lastData: unknown
  lastUpdatedAt: number
  quietPolls: number
}

export function createBackoffState(): BackoffState {
  return { lastData: undefined, lastUpdatedAt: 0, quietPolls: 0 }
}

/**
 * The policy, separated from the plumbing so it can be tested without a DOM.
 * Advances `state` for this observation and returns the next interval.
 *
 * Counts only real fetches: this is consulted on renders too, and counting those
 * would back off according to how busy React was rather than how quiet the
 * server was.
 */
export function nextPollInterval(
  state: BackoffState,
  fetched: { data: unknown; dataUpdatedAt: number },
  baseMs: number,
  visible: boolean
): number | false {
  if (fetched.dataUpdatedAt !== state.lastUpdatedAt) {
    // The first observation establishes a baseline; there is no previous fetch
    // to have been identical to, so it must not count as a quiet one.
    if (state.lastUpdatedAt !== 0) {
      state.quietPolls = fetched.data === state.lastData ? state.quietPolls + 1 : 0
    }
    state.lastUpdatedAt = fetched.dataUpdatedAt
    state.lastData = fetched.data
  }

  if (!visible) return false
  return state.quietPolls >= BACKOFF_AFTER ? baseMs * BACKOFF_FACTOR : baseMs
}

/**
 * Returns a value for `refetchInterval`, in its FUNCTION form.
 *
 * The function form matters: deciding the next interval needs the result of the
 * last fetch, and a hook called while building a query's own options cannot see
 * that query's data yet. TanStack hands the live query to the callback instead,
 * which sidesteps the ordering problem entirely.
 *
 * @param baseMs interval while things are happening
 */
export function useIdleBackoffPoll(baseMs: number): (query: PolledQuery) => number | false {
  // Subscribing still matters even though the callback reads visibility live:
  // it's the re-render on visibilitychange that makes TanStack recompute the
  // interval, so a tab coming back to the foreground restarts polling at once
  // rather than whenever something else happens to re-render.
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const state = useRef<BackoffState>(createBackoffState())

  return useCallback(
    (query: PolledQuery) =>
      nextPollInterval(
        state.current,
        query.state,
        baseMs,
        // Read live rather than closing over the render's value: this callback
        // outlives the render that made it, and a stale `false` here would
        // leave the query parked.
        typeof document === 'undefined' || document.visibilityState === 'visible'
      ),
    [baseMs]
  )
}
