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
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
    }
  }, [queryClient])

  return null
}
