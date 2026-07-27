// ─── Runsemble service worker ─────────────────────────────────────────────────
// Makes the app open with no signal by caching the app shell, static chunks,
// and map tiles at runtime. Strategy is deliberately conservative so online
// users always get fresh content:
//   - navigations  -> network-first, fall back to cached shell when offline
//   - static/_next -> stale-while-revalidate
//   - map tiles    -> cache-first (so previously-seen areas work offline)
//   - /api/*       -> untouched (network only; offline saves land in a later step)
// Runs on runsemble.net, so it also benefits the iPhone PWA + web, not just Android.

// Bump on any deploy that must force old shells/chunks out of the cache. v2:
// clears caches left by builds served during the frozen-deploy window so a
// device that was stuck on a stale bundle picks the new one up on next launch.
const VERSION = 'v2'
const SHELL = `rs-shell-${VERSION}`
const STATIC = `rs-static-${VERSION}`
const TILES = `rs-tiles-${VERSION}`
const KEEP = [SHELL, STATIC, TILES]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

function isTileHost(hostname) {
  return /cartocdn\.com|tile\.openstreetmap\.org/.test(hostname)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // API is never cached — always hit the network (with cookies) so auth and
  // saves behave normally. Offline save/sync is a separate step.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // App shell (navigations): network-first, cache the result, fall back offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(SHELL)
          cache.put(req, res.clone())
          cache.put('/', res.clone())
          return res
        } catch {
          const cache = await caches.open(SHELL)
          return (await cache.match(req)) || (await cache.match('/')) || Response.error()
        }
      })()
    )
    return
  }

  // Map tiles: cache-first so a run in a previously-seen area still shows a map.
  if (isTileHost(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILES)
        const hit = await cache.match(req)
        if (hit) return hit
        try {
          const res = await fetch(req)
          if (res.ok) cache.put(req, res.clone())
          return res
        } catch {
          return hit || Response.error()
        }
      })()
    )
    return
  }

  // Same-origin static assets (JS/CSS/fonts/images/_next): stale-while-revalidate.
  const isStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/') ||
      /\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|webmanifest)$/.test(url.pathname))
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC)
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || network
      })()
    )
    return
  }

  // Everything else: network, fall back to cache if offline.
  event.respondWith(fetch(req).catch(async () => (await caches.match(req)) || Response.error()))
})
