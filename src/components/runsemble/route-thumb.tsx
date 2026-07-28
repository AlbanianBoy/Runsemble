// ─── RouteThumb ───────────────────────────────────────────────────────────────
// A static SVG of a recorded route — the shape only, no basemap. The feed used
// to mount a full Leaflet map (tiles + panes + a live map instance) in every run
// post; with several posts on screen that spawned half a dozen live maps at once
// and bogged the whole page down — janky scroll, battery drain, and it could
// freeze the renderer outright. A feed thumbnail only needs to show the line, so
// this draws it as one SVG polyline (the Strava idiom: a bright line on a calm
// card), which costs almost nothing no matter how many are on screen. RouteMap
// (real Leaflet, with street context) stays for the run summary and detail, where
// a single interactive map is worth the weight.
//
// Pure and presentational — no hooks, no window — so it renders anywhere and
// needs no dynamic import.

import type { LatLng } from '@/lib/geo'

export interface RouteThumbProps {
  points: LatLng[]
  className?: string
}

const W = 200
const H = 120
const PAD = 12
// A thumbnail needs the route's shape, not every GPS fix — a long run can carry
// thousands of points, so downsample to keep the SVG tiny.
const MAX_POINTS = 160

function project(points: LatLng[]) {
  if (points.length < 2) return null

  const step = Math.max(1, Math.ceil(points.length / MAX_POINTS))
  const sampled: LatLng[] = []
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]!)
  const last = points[points.length - 1]!
  if (sampled[sampled.length - 1] !== last) sampled.push(last)

  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
  }
  // Longitude degrees shrink toward the poles; scale lng by cos(lat) so the
  // shape isn't stretched sideways.
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)) || 1
  const spanLat = Math.max(maxLat - minLat, 1e-6)
  const spanLng = Math.max((maxLng - minLng) * cos, 1e-6)
  const scale = Math.min((W - 2 * PAD) / spanLng, (H - 2 * PAD) / spanLat)
  const offX = (W - spanLng * scale) / 2
  const offY = (H - spanLat * scale) / 2
  // Flip y: higher latitude sits toward the top of the SVG.
  const toXY = (p: LatLng): [number, number] => [
    offX + (p.lng - minLng) * cos * scale,
    offY + (maxLat - p.lat) * scale,
  ]

  const xy = sampled.map(toXY)
  return {
    line: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    start: xy[0]!,
    end: xy[xy.length - 1]!,
  }
}

export default function RouteThumb({ points, className }: RouteThumbProps) {
  const p = project(points)
  if (!p) return null
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Run route"
    >
      <polyline
        points={p.line}
        fill="none"
        stroke="#14b8a6"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={p.start[0]} cy={p.start[1]} r={4} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
      <circle cx={p.end[0]} cy={p.end[1]} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}
