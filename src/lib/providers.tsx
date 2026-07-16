'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { useCallback } from 'react'
import { useRunsembleStore } from '@/lib/store'
import { usePushRegistration } from '@/lib/push-register'
import { useLocationRefresh } from '@/lib/use-location-refresh'

// Inner component so hooks can read from the store (which is inside the tree).
function AppBootstrap() {
  const userId = useRunsembleStore((s) => s.currentUser?.id)
  const hasCoords = useRunsembleStore((s) => s.currentUser?.lat != null && s.currentUser?.lng != null)
  const updateProfile = useRunsembleStore((s) => s.updateProfile)

  // Register / refresh the FCM token whenever the signed-in user changes.
  // Silent no-op on web and on native builds without push-notifications.
  usePushRegistration(userId)

  // Re-read where the user is when the app opens. Coordinates used to be written
  // once at onboarding and never again, so every pin was frozen at whatever spot
  // the account was created in.
  const onLocation = useCallback(
    (coords: { lat: number; lng: number }) => updateProfile(coords),
    [updateProfile]
  )
  useLocationRefresh(userId, hasCoords, onLocation)

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            // Never propagate query errors into the React tree — errors stay in
            // query state (isError: true) and components handle them locally.
            // Without this, any failing query will throw into the nearest React
            // error boundary and crash the whole app with "Something went wrong".
            throwOnError: false,
          },
        },
      })
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AppBootstrap />
        {children}
        <SonnerToaster position="top-center" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
