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
// For a premium style later (MapTiler, Stadia, or a keyed CARTO account), set
// NEXT_PUBLIC_MAP_TILE_URL to that provider's {z}/{x}/{y} template — plus a key
// query param — and add its host to img-src in next.config.ts. No component
// changes needed. Note NEXT_PUBLIC_* is inlined at build time, so a provider
// swap needs a rebuild, not just an env edit.
//
// Template tokens: {s} rotates the a/b/c subdomains; {z}/{x}/{y} are the tile
// coords. We deliberately omit {r} (the @2x retina suffix) — OSM's standard
// tiles don't serve @2x and would 404 on it.
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const TILE_MAX_ZOOM = 19
