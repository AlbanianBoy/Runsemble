'use client'

import { useEffect } from 'react'

// Registers the service worker (public/sw.js) so the app can open offline.
// Production only — a SW on localhost interferes with dev HMR and would cache
// stale dev assets.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
