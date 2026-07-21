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

import { useSyncExternalStore } from 'react'

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
