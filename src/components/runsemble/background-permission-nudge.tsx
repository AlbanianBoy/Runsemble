'use client'

import { useEffect, useState } from 'react'
import { MapPin, Bell, BatteryCharging, Zap, ChevronRight, X } from 'lucide-react'
import { isNativeApp, openAppSettings, requestIgnoreBatteryOptimizations, getDeviceInfo } from '@/lib/geo-watch'

// Android hands out "while using the app" location by default, blocks
// notifications until asked, and — on aggressive OEM skins (Samsung, Xiaomi, …) —
// *freezes* backgrounded apps, which stops screen-off tracking dead. None of this
// can be flipped for the user from an in-app API, so we explain it once and
// deep-link to Settings, with the extra OEM-specific step called out. Shown only
// in the native app, only until acknowledged.
const ACK_KEY = 'runsemble-bg-perm-ack'

// OEM-specific "never freeze this app" step. name is what we call the phone; path
// is the exact settings trail. Manufacturer comes from Build.MANUFACTURER (native,
// reliable); the WebView UA is only a fallback because newer Chrome reduces it.
type OemGuide = { name: string; path: string }
function guideFor(manufacturer: string, ua: string): OemGuide | null {
  const m = manufacturer.toLowerCase()
  const hit = (native: string, re: RegExp) => m.includes(native) || re.test(ua)
  if (hit('samsung', /samsung|SM-[A-Z0-9]{3}|Galaxy/i))
    return { name: 'Samsung', path: 'Battery → Background usage limits → Never sleeping apps → add Runsemble' }
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco') || /xiaomi|redmi|poco/i.test(ua))
    return { name: 'Xiaomi', path: 'Battery saver → No restrictions, and turn on Autostart for Runsemble' }
  if (m.includes('huawei') || m.includes('honor') || /huawei|honor/i.test(ua))
    return { name: 'Huawei', path: 'App launch → manage Runsemble manually → allow Run in background' }
  if (m.includes('oppo') || m.includes('realme') || /\bOPPO\b|realme|CPH\d|RMX\d/i.test(ua))
    return { name: 'your phone', path: 'Battery → allow background activity, and lock Runsemble in Recents' }
  if (m.includes('vivo') || /\bvivo\b/i.test(ua))
    return { name: 'vivo', path: 'Battery → high background power consumption → allow Runsemble' }
  if (m.includes('oneplus') || /oneplus/i.test(ua))
    return { name: 'OnePlus', path: 'Battery → Battery optimization → Don’t optimize Runsemble' }
  return null
}

export function BackgroundPermissionNudge() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return isNativeApp() && localStorage.getItem(ACK_KEY) !== '1'
    } catch {
      return false
    }
  })
  const [oem, setOem] = useState<OemGuide | null>(null)

  // Resolve the OEM guidance once (native manufacturer, UA fallback).
  useEffect(() => {
    let cancelled = false
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    void getDeviceInfo().then(({ manufacturer }) => {
      if (!cancelled) setOem(guideFor(manufacturer, ua))
    })
    return () => { cancelled = true }
  }, [])

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
        A few one-time Android settings so your run keeps recording in your pocket:
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
        <div className="flex items-center gap-2 text-xs">
          <BatteryCharging className="h-4 w-4 text-primary shrink-0" />
          <span>Battery → <span className="font-medium">Unrestricted</span> (tap “Allow background” below)</span>
        </div>
      </div>

      {/* The one that actually matters on aggressive OEMs — no API can set it for us. */}
      {oem && (
        <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Zap className="h-3.5 w-3.5 shrink-0" /> Important on {oem.name}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {oem.name} freezes apps to save battery — without this one setting, tracking stops when your screen turns off:
          </p>
          <p className="text-[11px] font-medium mt-1.5 leading-snug">{oem.path}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => requestIgnoreBatteryOptimizations()}
          className="flex-1 min-w-[9rem] h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
        >
          Allow background <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => openAppSettings()}
          className="flex-1 min-w-[9rem] h-9 rounded-full bg-muted text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
        >
          Open settings
        </button>
        <button onClick={ack} className="h-9 px-4 rounded-full text-xs font-medium text-muted-foreground active:scale-95 transition-transform">
          Done
        </button>
      </div>
    </div>
  )
}
