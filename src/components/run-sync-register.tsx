'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { pendingRunCount, syncPendingRuns } from '@/lib/run-sync'

// Drains the offline run queue (on open / online / returning to the app) and
// shows a small "N runs waiting to upload" badge whenever the queue isn't empty,
// so a run saved with no signal is visibly accounted for instead of feeling lost.
export function RunSyncRegister() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => { if (!cancelled) setPending(pendingRunCount()) }

    const drain = async () => {
      refresh()
      if (pendingRunCount() === 0) return
      const synced = await syncPendingRuns()
      refresh()
      if (cancelled || synced === 0) return
      toast.success(`${synced} offline run${synced > 1 ? 's' : ''} uploaded ✅`)
      ;['feed', 'runs', 'leaderboard', 'badges', 'users', 'buddies', 'challenges', 'notifications'].forEach(
        (k) => queryClient.invalidateQueries({ queryKey: [k] })
      )
    }

    drain()
    const onOnline = () => drain()
    const onVisible = () => { if (document.visibilityState === 'visible') drain() }
    window.addEventListener('online', onOnline)
    window.addEventListener('focus', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    // Poll so a run just queued from the tracker surfaces within a few seconds.
    const iv = setInterval(refresh, 4000)

    return () => {
      cancelled = true
      clearInterval(iv)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('focus', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [queryClient])

  if (pending === 0) return null

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] z-[900] pointer-events-none">
      <div className="glass border shadow-sm rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        {pending} run{pending > 1 ? 's' : ''} waiting to upload…
      </div>
    </div>
  )
}
