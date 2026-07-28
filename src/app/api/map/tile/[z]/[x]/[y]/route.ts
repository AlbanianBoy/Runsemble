// ─── /api/map/tile/[z]/[x]/[y] — same-origin basemap tile proxy ───────────────
// PUBLIC. The browser asks us for a tile; we fetch it from OpenStreetMap
// server-side and hand back the bytes.
//
// Why this exists: keyless tile CDNs (OSM, CARTO) 503 the app's tile requests.
// A live capture proved the discriminator isn't our code and isn't the Referer
// (curl with a runsemble.net Referer returns 200) — it's the burst of concurrent
// tile requests from a residential browser IP, which both CDNs throttle. A
// direct/server-side request succeeds. So we move the fetch server-side: the
// browser hits us (same-origin, no throttle, no CSP/referer friction) and Vercel
// fetches OSM once per tile with a proper identifying User-Agent, then edge-caches
// the result so OSM sees almost no traffic. For a premium keyed provider later,
// set NEXT_PUBLIC_MAP_TILE_URL and this route simply goes unused — see
// src/lib/map-tiles.ts.

import { NextRequest, NextResponse } from 'next/server'

// OSM's tile usage policy requires a valid, identifying User-Agent.
const OSM_UA = 'Runsemble/1.0 (+https://runsemble.net)'

// A premium dark basemap when a MapTiler key is present — the single biggest lift
// the hero map can get, versus the flat desaturated OSM fallback. The key lives
// server-side only (MAPTILER_KEY, never a NEXT_PUBLIC_* var), so it never reaches
// the browser: the client keeps hitting this same-origin proxy and we attach the
// key here. No CSP change is needed for the same reason — the browser only ever
// talks to this route. Inert until a key is set; MAPTILER_STYLE picks the style
// (default streets-v2-dark). Free tier ~100k tile loads/month, and our 30-day
// edge cache keeps us far under it.
const MAPTILER_KEY = process.env.MAPTILER_KEY
const MAPTILER_STYLE = process.env.MAPTILER_STYLE ?? 'streets-v2-dark'

function upstreamTileUrl(z: string, x: string, y: string): string {
  return MAPTILER_KEY
    ? `https://api.maptiler.com/maps/${MAPTILER_STYLE}/256/${z}/${x}/${y}.png?key=${MAPTILER_KEY}`
    : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

// A 1×1 transparent PNG, returned when upstream fails so a single missing tile
// shows as a gap over the map background rather than a broken-image icon.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function isTileIndex(v: string): boolean {
  return /^\d{1,7}$/.test(v)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params

  // Validate before touching the network: z is a zoom level, x/y index the tile
  // grid at that zoom. Bad input never becomes an upstream request.
  const zoom = Number(z)
  if (!isTileIndex(z) || !isTileIndex(x) || !isTileIndex(y) || zoom > 19) {
    return new NextResponse('bad tile', { status: 400 })
  }
  const max = 2 ** zoom
  if (Number(x) >= max || Number(y) >= max) {
    return new NextResponse('bad tile', { status: 400 })
  }

  try {
    const upstream = await fetch(upstreamTileUrl(z, x, y), {
      headers: { 'User-Agent': OSM_UA, Accept: 'image/png,image/*' },
      // We do our own edge caching via the response headers below; don't let the
      // data cache double-store the image bytes.
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new NextResponse(BLANK_PNG, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
      })
    }

    const body = await upstream.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Browser holds a day; Vercel's edge holds 30 days, so OSM is hit at most
        // once per tile per month no matter how many people load the map.
        'Cache-Control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new NextResponse(BLANK_PNG, {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' },
    })
  }
}
