'use client'

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { MotionConfig } from 'framer-motion'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { useCallback } from 'react'
import { useRunsembleStore } from '@/lib/store'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useLocationRefresh } from '@/lib/use-location-refresh'
import { setAnalyticsEnabled, identifyUser } from '@/lib/analytics'

// Inner component so hooks can read from the store (which is inside the tree).
function AppBootstrap() {
  const userId = useRunsembleStore((s) => s.currentUser?.id)
  const analyticsConsent = useRunsembleStore((s) => s.currentUser?.analyticsConsent === true)
  const hasCoords = useRunsembleStore((s) => s.currentUser?.lat != null && s.currentUser?.lng != null)
  const updateProfile = useRunsembleStore((s) => s.updateProfile)

  // Product analytics — inert without a key, and off unless the user opted in.
  // Analytics is its own purpose, so it follows consent: turned on when granted,
  // and stopped immediately if the user withdraws it in settings.
  useEffect(() => {
    setAnalyticsEnabled(analyticsConsent)
  }, [analyticsConsent])
  useEffect(() => {
    if (userId && analyticsConsent) identifyUser(userId)
  }, [userId, analyticsConsent])

  // Register / refresh the FCM token whenever the signed-in user changes, and
  // route arriving pushes. Silent no-op on web and on native builds without
  // push-notifications. Mounted here rather than in the root layout because it
  // needs userId — see the note at the top of the hook for what the second,
  // login-blind copy in layout.tsx was costing.
  usePushNotifications(userId)

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
    // globals.css has a prefers-reduced-motion block, but it only reaches CSS
    // animations — a framer-motion `repeat: Infinity` is a JS loop and sails
    // straight past `animation-iteration-count: 1`. That gap is how an infinite
    // arrow survived on the first screen of onboarding despite the rule against
    // looping animations. MotionConfig closes it for every motion component at
    // once, rather than relying on each one remembering.
    <MotionConfig reducedMotion="user">
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AppBootstrap />
        {children}
        <SonnerToaster position="top-center" richColors />
      </QueryClientProvider>
    </ThemeProvider>
    </MotionConfig>
  )
}
