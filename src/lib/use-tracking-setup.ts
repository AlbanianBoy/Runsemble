/**
 * useTrackingSetup — Phase 3
 *
 * Detects whether the current device needs OEM battery-exemption steps
 * (Samsung / Xiaomi / Huawei / Oppo) and manages one-time completion state.
 *
 * Steps are shown once, before the first run on native. After the user taps
 * through and marks done (or skips), the sheet never appears again.
 */

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'runsemble-tracking-setup-v1'

export interface SetupStep {
  id: string
  title: string
  description: string
  /** If present, tapping the action button fires this intent / URL. */
  actionLabel: string
  actionIntent: string | null
}

function getManufacturer(): string {
  // On native Capacitor, Device.getInfo() is async; for manufacturer detection
  // we read the userAgent as a fast sync fallback — adequate for OEM detection.
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('samsung')) return 'samsung'
  if (ua.includes('xiaomi') || ua.includes('miui') || ua.includes('redmi')) return 'xiaomi'
  if (ua.includes('huawei') || ua.includes('emui') || ua.includes('harmonyos')) return 'huawei'
  if (ua.includes('oppo') || ua.includes('coloros')) return 'oppo'
  if (ua.includes('vivo') || ua.includes('originos')) return 'vivo'
  if (ua.includes('oneplus') || ua.includes('oxygenOS')) return 'oneplus'
  return 'other'
}

function stepsForManufacturer(mfr: string): SetupStep[] {
  switch (mfr) {
    case 'samsung':
      return [
        {
          id: 'samsung-never-sleep',
          title: 'Add to Never sleeping apps',
          description:
            'Samsung pauses apps it doesn\u2019t recognise as trackers. Adding Runsemble to \'Never sleeping apps\' tells your phone to keep it awake during runs.',
          actionLabel: 'Open Battery settings',
          // Samsung battery / device care deep-link. Falls back to app-info.
          actionIntent: 'com.samsung.android.sm',
        },
        {
          id: 'samsung-unrestricted',
          title: 'Set battery to Unrestricted',
          description:
            'In App info \u2192 Battery, choose \'Unrestricted\' so Samsung doesn\u2019t limit background activity.',
          actionLabel: 'Open app battery settings',
          actionIntent: 'app-battery-settings',
        },
        {
          id: 'samsung-adaptive-off',
          title: 'Turn off Adaptive battery',
          description:
            'Adaptive battery can override your settings mid-run. Disable it in Battery \u2192 More battery settings.',
          actionLabel: 'Open battery settings',
          actionIntent: 'battery-settings',
        },
      ]
    case 'xiaomi':
      return [
        {
          id: 'xiaomi-autostart',
          title: 'Enable Autostart',
          description:
            'MIUI blocks apps from running in the background unless you explicitly allow autostart. Go to Security app \u2192 Manage apps \u2192 Autostart.',
          actionLabel: 'Open Security app',
          actionIntent: 'com.miui.securitycenter',
        },
        {
          id: 'xiaomi-no-restrictions',
          title: 'Set to No restrictions',
          description:
            'In App info \u2192 Battery saver, choose \'No restrictions\' to prevent MIUI limiting GPS in the background.',
          actionLabel: 'Open app info',
          actionIntent: 'app-info',
        },
      ]
    case 'huawei':
      return [
        {
          id: 'huawei-launch',
          title: 'Allow background activity',
          description:
            'EMUI / HarmonyOS restricts background apps. In Phone Manager \u2192 App launch, set Runsemble to Manual and enable all three toggles.',
          actionLabel: 'Open Phone Manager',
          actionIntent: 'com.huawei.systemmanager',
        },
      ]
    case 'oppo':
      return [
        {
          id: 'oppo-autostart',
          title: 'Enable Auto-start',
          description:
            'ColorOS restricts background apps. Go to Settings \u2192 Battery \u2192 App quick-freeze and make sure Runsemble isn\u2019t frozen.',
          actionLabel: 'Open Battery settings',
          actionIntent: 'battery-settings',
        },
      ]
    default:
      // Generic Android — battery optimisation dialog is already fired in run-tracker;
      // no extra steps needed.
      return []
  }
}

export function useTrackingSetup() {
  const isNative = typeof window !== 'undefined'
    ? (() => { try { return Capacitor.isNativePlatform() } catch { return false } })()
    : false

  const [completed, setCompleted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(STORAGE_KEY) === '1'
  })

  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set())

  const manufacturer = isNative ? getManufacturer() : ''
  const steps = stepsForManufacturer(manufacturer)

  // No steps needed (non-OEM Android, web, iOS) → auto-complete immediately.
  useEffect(() => {
    if (isNative && steps.length === 0 && !completed) {
      localStorage.setItem(STORAGE_KEY, '1')
      setCompleted(true)
    }
  }, [isNative, steps.length, completed])

  const toggleStep = (id: string) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const markDone = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setCompleted(true)
  }

  const allChecked = steps.length > 0 && checkedSteps.size >= steps.length

  return {
    /** True when setup is complete or not needed — START button should be enabled. */
    setupComplete: completed,
    /** True when there are steps to show (OEM native device, first run only). */
    needsSetup: isNative && !completed && steps.length > 0,
    steps,
    checkedSteps,
    toggleStep,
    allChecked,
    markDone,
    manufacturer,
  }
}
