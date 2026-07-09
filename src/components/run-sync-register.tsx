'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { pendingRunCount, syncPendingRuns } from '@/lib/run-sync'

// Drains the offline run queue: once on mount (app open) and again whenever the
// browser reports it's back online. When runs actually upload, refresh the
// views that show them so the feed/profile/leaderboard catch up.
export function RunSyncRegister() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false

    const drain = async () => {
      if (pendingRunCount() === 0) return
      const synced = await syncPendingRuns()
      if (cancelled || synced === 0) return
      toast.success(`${synced} offline run${synced > 1 ? 's' : ''} uploaded ✅`)
      ;['feed', 'runs', 'leaderboard', 'badges', 'users', 'buddies', 'challenges', 'notifications'].forEach(
        (k) => queryClient.invalidateQueries({ queryKey: [k] })
      )
    }

    drain()
    const onOnline = () => drain()
    // Returning to the app (foreground) is the reliable signal in the native
    // WebView: when the phone regains signal it's usually backgrounded, so the
    // `online` event is missed while the WebView sleeps. Draining on
    // visibility/focus means a queued run uploads as soon as you reopen the app,
    // with no need to fully close and relaunch it.
    const onVisible = () => { if (document.visibilityState === 'visible') drain() }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [queryClient])

  return null
}
