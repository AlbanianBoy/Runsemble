'use client'

import { useState } from 'react'
import { MapPin, Bell, ChevronRight, X } from 'lucide-react'
import { isNativeApp, openAppSettings } from '@/lib/geo-watch'

// Android hands out "while using the app" location by default, and blocks
// notifications until asked — so a run silently stops recording in your pocket
// and the tracking banner never shows. Neither can be fixed from an in-app
// prompt on modern Android, so we explain it once and deep-link to Settings.
// Shown only in the native app, and only until the user acknowledges it.
const ACK_KEY = 'runsemble-bg-perm-ack'

export function BackgroundPermissionNudge() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return isNativeApp() && localStorage.getItem(ACK_KEY) !== '1'
    } catch {
      return false
    }
  })

  if (!show) return null

  const ack = () => {
    try { localStorage.setItem(ACK_KEY, '1') } catch {}
    setShow(false)
  }

  return (
    <div className="w-full rounded-2xl border bg-card p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">Keep tracking with your screen off</p>
        <button onClick={ack} aria-label="Dismiss" className="text-muted-foreground/60 hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        So your run keeps recording in your pocket, set these once in Android:
      </p>
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span>Location → <span className="font-medium">Allow all the time</span></span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Bell className="h-4 w-4 text-primary shrink-0" />
          <span>Notifications → <span className="font-medium">Allowed</span></span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => openAppSettings()}
          className="flex-1 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
        >
          Open settings <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button onClick={ack} className="h-9 px-4 rounded-full bg-muted text-xs font-medium active:scale-95 transition-transform">
          Done
        </button>
      </div>
    </div>
  )
}
