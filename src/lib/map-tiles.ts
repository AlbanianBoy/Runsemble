// ─── Basemap tiles ────────────────────────────────────────────────────────────
// One place decides which raster basemap every Leaflet map draws, because the
// choice is a reliability decision, not a per-component one — and it used to be
// copy-pasted into four map files that could drift apart.
//
// We were on CARTO's keyless "voyager" tiles (basemaps.cartocdn.com). They look
// premium, but CARTO 503s keyless production traffic without warning: the map
// went blank for everyone even though Leaflet was requesting tiles correctly
// (a live capture showed 8/8 tile requests returning 503). OpenStreetMap's
// standard tiles are the reliable keyless default and are fine at pilot volume.
//
// The default is our own same-origin proxy (src/app/api/map/tile/[z]/[x]/[y]),
// NOT the OSM CDN directly: keyless CDNs 503 the browser's concurrent tile burst
// from a residential IP, so we fetch tiles server-side and edge-cache them. The
// browser only ever talks to us. See the proxy route for the full reasoning.
//
// For a premium style later (MapTiler, Stadia, or a keyed CARTO account), set
// NEXT_PUBLIC_MAP_TILE_URL to that provider's {z}/{x}/{y} template — plus a key
// query param — and add its host to img-src in next.config.ts. That bypasses the
// proxy entirely. Note NEXT_PUBLIC_* is inlined at build time, so a provider swap
// needs a rebuild, not just an env edit.
//
// Template tokens: {z}/{x}/{y} are the tile coords. We omit {s} (subdomain
// rotation is pointless for a same-origin path) and {r} (the @2x retina suffix,
// which OSM's standard tiles don't serve).
// The ?v tag is part of the proxy's cache key at Vercel's edge — bump it whenever
// the tile SOURCE changes (e.g. OSM → MapTiler), otherwise the 30-day edge cache
// keeps serving the old provider's tiles under the same path. v2 = MapTiler dark.
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? '/api/map/tile/{z}/{x}/{y}?v=2'

export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const TILE_MAX_ZOOM = 19
