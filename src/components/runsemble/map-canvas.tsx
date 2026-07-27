'use client'

// ─── MapCanvas ───────────────────────────────────────────────────────────────────────────────
// Renders an OpenStreetMap basemap and plots:
//   • hotspots at their true lat/lng
//   • nearby available runners at PRIVACY-FUZZED coordinates (~200m grid)
//   • the current user’s own position
//
// Cluster behaviour: when 2+ runners share the same fuzzed grid cell (within
// CLUSTER_THRESHOLD degrees) a single cluster marker is shown instead. Tapping
// it flies the map in by 2 zoom levels so the individual markers separate.
// Only when a runner marker is alone does tapping open the profile sheet.
//
// Hotspots cluster the same way but measured in screen pixels — see
// buildHotspotClusters for why the two use different yardsticks.
//
// Loaded via next/dynamic with { ssr: false } from map-tab.

import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { type LatLng } from '@/lib/geo'
import type { ApiHotspot, ApiUser } from '@/lib/types'
import { getAvatarHex } from './helpers'

// How close two fuzzed coordinates must be (in degrees) to be treated as the
// same cluster. 0.002° ≈ 200 m, matching the fuzz grid cell size.
const CLUSTER_THRESHOLD = 0.002

// The hotspot pin's teal, pulled out so the hotspot cluster marker can borrow it
// — a stack of runs should still read as runs, not as a stack of runners.
const HOTSPOT_COLOR = '#14b8a6'

// How close two hotspot pins may sit, in screen pixels, before they're stacked
// into one marker. The pin itself is 30px but the tap target is the 44px
// minimum, so pins that look merely close still steal each other's taps.
const HOTSPOT_CLUSTER_PX = 44

// Pin colour comes from the shared avatar palette (no violet/pink, and the same
// hash) so a runner's map pin matches their avatar everywhere else in the app.
const colorForName = getAvatarHex

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

// react-leaflet compares the `icon` prop by reference and calls marker.setIcon()
// whenever it differs, and Leaflet's setIcon tears down and rebuilds the
// marker's DOM element. Built inline in JSX these factories hand back a fresh
// object on every render, which was free while nothing re-rendered them — but
// the hotspot layer now re-renders on zoom, so every surviving pin was being
// rebuilt and its `rs-pulse` restarted from frame zero, all of them in unison.
// A synchronised flicker on every pinch that nobody asked for.
//
// Both factories are pure functions of their arguments, and a Leaflet icon is
// stateless config designed to be shared between markers, so caching on the
// arguments makes the identity stable without changing what's drawn.
const iconCache = new Map<string, L.DivIcon>()
function cachedIcon(key: string, build: () => L.DivIcon): L.DivIcon {
  const hit = iconCache.get(key)
  if (hit) return hit
  const icon = build()
  iconCache.set(key, icon)
  return icon
}

function hotspotIcon(count: number): L.DivIcon {
  return cachedIcon(`hotspot:${count}`, () => buildHotspotIcon(count))
}
function clusterIcon(count: number, color: string): L.DivIcon {
  return cachedIcon(`cluster:${count}:${color}`, () => buildClusterIcon(count, color))
}

function buildHotspotIcon(count: number): L.DivIcon {
  const badge =
    count > 0
      ? `<span style="position:absolute;top:-6px;right:-6px;background:#ea580c;color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:999px;padding:0 3px;border:1.5px solid #fff;">${count}</span>`
      : ''
  return L.divIcon({
    className: 'rs-divicon',
    html: `
      <div style="position:relative;width:30px;height:30px;">
        <span class="rs-pulse" style="position:absolute;inset:-9px;border-radius:999px;background:rgba(249,115,22,.25);"></span>
        <div style="position:relative;width:30px;height:30px;border-radius:999px;background:${HOTSPOT_COLOR};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        ${badge}
      </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function avatarIcon(name: string, size = 34, ring = '#fff'): L.DivIcon {
  const color = colorForName(name)
  return L.divIcon({
    className: 'rs-divicon',
    html: `
      <div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};border:2.5px solid ${ring};box-shadow:0 2px 5px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;font-family:inherit;">
        ${initials(name)}
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function buildClusterIcon(count: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'rs-divicon',
    html: `
      <div style="position:relative;width:40px;height:40px;">
        <span class="rs-pulse" style="position:absolute;inset:-6px;border-radius:999px;background:${color}33;"></span>
        <div style="position:relative;width:40px;height:40px;border-radius:999px;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;font-family:inherit;">
          ${count}
        </div>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

function youIcon(name: string, available: boolean): L.DivIcon {
  const bg = available ? '#10b981' : '#9ca3af'
  return L.divIcon({
    className: 'rs-divicon',
    html: `
      <div style="position:relative;width:40px;height:40px;">
        ${available ? '<span class="rs-pulse" style="position:absolute;inset:-6px;border-radius:999px;background:rgba(16,185,129,.25);"></span>' : ''}
        <div style="position:relative;width:40px;height:40px;border-radius:999px;background:${bg};border:3px solid #fff;box-shadow:0 2px 7px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;font-family:inherit;">
          ${initials(name)}
        </div>
        <div style="position:absolute;bottom:0;right:0;width:13px;height:13px;border-radius:999px;background:${available ? '#34d399' : '#d1d5db'};border:2px solid #fff;"></div>
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

// ─── Cluster key ────────────────────────────────────────────────────────────────────────────
function clusterKey(lat: number, lng: number): string {
  // Snap to CLUSTER_THRESHOLD grid — same cell = same key.
  const r = 1 / CLUSTER_THRESHOLD
  return `${Math.round(lat * r)},${Math.round(lng * r)}`
}

interface RunnerCluster {
  key: string
  lat: number
  lng: number
  runners: ApiUser[]
}

function buildClusters(runners: ApiUser[]): RunnerCluster[] {
  const map = new Map<string, RunnerCluster>()
  for (const u of runners) {
    if (u.lat == null || u.lng == null) continue
    // These coordinates arrive already snapped — /api/users never sends a true
    // position. Re-snapping them here was pointless when the grid was shared and
    // is wrong now that it isn't: the client has no access to the per-user
    // offset, so a second snap would drag the pin off the cell the server chose.
    const key = clusterKey(u.lat, u.lng)
    if (map.has(key)) {
      map.get(key)!.runners.push(u)
    } else {
      map.set(key, { key, lat: u.lat, lng: u.lng, runners: [u] })
    }
  }
  return Array.from(map.values())
}

// ─── Inner component (has access to useMap) ────────────────────────────────────────────────────
function RunnerMarkers({
  clusters,
  onSelectRunner,
}: {
  clusters: RunnerCluster[]
  onSelectRunner: (u: ApiUser) => void
}) {
  const leafletMap = useMap()

  const handleClusterClick = useCallback(
    (cluster: RunnerCluster) => {
      if (cluster.runners.length === 1) {
        // Single runner — open profile sheet.
        onSelectRunner(cluster.runners[0])
      } else {
        // Multiple runners at the same cell — zoom in to separate them.
        leafletMap.flyTo(
          [cluster.lat, cluster.lng],
          Math.min(leafletMap.getZoom() + 2, leafletMap.getMaxZoom()),
          { duration: 0.5 }
        )
      }
    },
    [leafletMap, onSelectRunner]
  )

  return (
    <>
      {clusters.map((cluster) => {
        const isCluster = cluster.runners.length > 1
        const representativeName = cluster.runners[0].name
        const icon = isCluster
          ? clusterIcon(cluster.runners.length, colorForName(representativeName))
          : avatarIcon(representativeName)
        return (
          <Fragment key={cluster.key}>
            <Circle
              center={[cluster.lat, cluster.lng]}
              radius={200}
              pathOptions={{
                color: colorForName(representativeName),
                weight: 1,
                opacity: 0.35,
                fillOpacity: 0.08,
              }}
            />
            <Marker
              position={[cluster.lat, cluster.lng]}
              icon={icon}
              eventHandlers={{ click: () => handleClusterClick(cluster) }}
            />
          </Fragment>
        )
      })}
    </>
  )
}

// ─── Hotspot clusters ───────────────────────────────────────────────────────────────────────
interface HotspotCluster {
  key: string
  lat: number
  lng: number
  hotspots: ApiHotspot[]
}

// Runners are grouped by degrees because their coordinates are already snapped to
// a 200m fuzz grid; hotspots sit at true coordinates, so the same trick would be
// wrong. Two pins 100m apart are one blob at city zoom and comfortably separate
// at street zoom — the thing that decides whether they overlap is pixels, not
// metres. project() is used rather than latLngToLayerPoint because it takes the
// zoom as an argument, which keeps the grouping a pure function of the zoom we
// re-render on instead of leaning on whatever the pane's current origin is.
function buildHotspotClusters(
  hotspots: ApiHotspot[],
  leafletMap: L.Map,
  zoom: number
): HotspotCluster[] {
  const groups: { seed: L.Point; members: ApiHotspot[] }[] = []

  for (const h of hotspots) {
    const pt = leafletMap.project([h.lat, h.lng], zoom)
    const hit = groups.find((g) => g.seed.distanceTo(pt) < HOTSPOT_CLUSTER_PX)
    if (hit) hit.members.push(h)
    else groups.push({ seed: pt, members: [h] })
  }

  return groups.map(({ members }) => ({
    // The seed's id: every hotspot seeds at most one group, so this is unique,
    // and it survives a pan (which regroups nothing) without remounting markers.
    key: members[0].id,
    lat: members.reduce((sum, h) => sum + h.lat, 0) / members.length,
    lng: members.reduce((sum, h) => sum + h.lng, 0) / members.length,
    hotspots: members,
  }))
}

function HotspotMarkers({
  hotspots,
  onSelectHotspot,
}: {
  hotspots: ApiHotspot[]
  onSelectHotspot: (h: ApiHotspot) => void
}) {
  const leafletMap = useMap()
  const [zoom, setZoom] = useState(() => leafletMap.getZoom())
  // Which member a stuck cluster should hand out next — see handleClusterClick.
  const cycleRef = useRef<Record<string, number>>({})

  // Pixel grouping only holds for the scale it was measured at, so it has to be
  // redone when the scale changes. zoomend is the event that matters — a pan
  // moves both pins by the same amount and can never regroup them — but moveend
  // is a cheap belt-and-braces subscription, since an unchanged zoom means React
  // bails out of the re-render and panning costs nothing. Leaflet's listeners
  // live outside React and are removed by hand: the map tab unmounts on every
  // tab switch, and a handler left attached keeps a dead component alive.
  useEffect(() => {
    const syncZoom = () => setZoom(leafletMap.getZoom())
    leafletMap.on('zoomend', syncZoom)
    leafletMap.on('moveend', syncZoom)
    return () => {
      leafletMap.off('zoomend', syncZoom)
      leafletMap.off('moveend', syncZoom)
    }
  }, [leafletMap])

  const clusters = useMemo(
    () => buildHotspotClusters(hotspots, leafletMap, zoom),
    [hotspots, leafletMap, zoom]
  )

  const handleClusterClick = useCallback(
    (cluster: HotspotCluster) => {
      if (cluster.hotspots.length === 1) {
        onSelectHotspot(cluster.hotspots[0])
        return
      }

      const currentZoom = leafletMap.getZoom()
      const maxZoom = leafletMap.getMaxZoom()
      if (currentZoom < maxZoom) {
        // Same gesture as a runner cluster: two levels in, and the pins split.
        leafletMap.flyTo([cluster.lat, cluster.lng], Math.min(currentZoom + 2, maxZoom), {
          duration: 0.5,
        })
        return
      }

      // Two Wednesday runs both entered as "Park Spoor Noord" end up on the exact
      // same coordinate, and no amount of zoom will ever pull those apart. Rather
      // than leave a pin that eats taps and only ever shows the top run, hand out
      // the next one down each time it's tapped, so the ones underneath are still
      // reachable.
      const idx = (cycleRef.current[cluster.key] ?? 0) % cluster.hotspots.length
      cycleRef.current[cluster.key] = idx + 1
      onSelectHotspot(cluster.hotspots[idx])
    },
    [leafletMap, onSelectHotspot]
  )

  return (
    <>
      {clusters.map((cluster) => (
        <Marker
          key={cluster.key}
          position={[cluster.lat, cluster.lng]}
          icon={
            cluster.hotspots.length > 1
              ? clusterIcon(cluster.hotspots.length, HOTSPOT_COLOR)
              : hotspotIcon(cluster.hotspots[0].participantCount)
          }
          eventHandlers={{ click: () => handleClusterClick(cluster) }}
        />
      ))}
    </>
  )
}

// ─── Recentre ────────────────────────────────────────────────────────────────
// One tap back to where you are. Panning away had no way back short of
// switching tabs and returning, which is a strange thing to have to discover on
// the screen the whole app opens to. The zoom buttons stay hidden on purpose —
// pinch works, and two more chrome elements on a phone-sized map cost more than
// they give — but "where am I" is not a gesture.
function RecentreControl({ me }: { me: LatLng }) {
  const map = useMap()
  const ref = useRef<HTMLButtonElement>(null)

  // Leaflet listens for clicks on the map container itself, and this button
  // sits inside it — without this, recentring also registers as a map tap.
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current)
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => map.flyTo([me.lat, me.lng], Math.max(map.getZoom(), 14), { duration: 0.5 })}
      aria-label="Centre the map on your location"
      className="absolute right-3 bottom-3 z-[1000] h-11 w-11 rounded-full bg-background/95 border border-border shadow-md flex items-center justify-center text-foreground active:scale-95 transition-transform"
    >
      <LocateFixed className="h-5 w-5" />
    </button>
  )
}

// ─── Keep Leaflet's viewport in sync with its container ─────────────────────────
// The map lives in a dvh-based, safe-area-aware box loaded via
// next/dynamic({ ssr:false }). That height resolves a beat AFTER Leaflet
// initialises, so Leaflet caches a 0×0 (or wrong) viewport and never requests a
// single tile — the container just paints its background and you get a blank map
// with only the markers floating on top. The same desync happens later when the
// mobile browser chrome hides on scroll (100dvh changes) or the device rotates.
// invalidateSize() recomputes the viewport and pulls the tiles in, so we call it
// right after mount (a few times, to catch the late dvh/safe-area resolution) and
// on every subsequent size change. Calling it when the size is already correct is
// a cheap no-op, so over-calling is safe.
function MapResizeFix() {
  const map = useMap()
  useEffect(() => {
    const fix = () => map.invalidateSize({ animate: false })
    const raf = requestAnimationFrame(fix)
    const t1 = setTimeout(fix, 250)
    const t2 = setTimeout(fix, 700)

    // The container's own height is driven by CSS, not by Leaflet, so recomputing
    // the viewport here can't feed back into a resize loop.
    const ro = new ResizeObserver(fix)
    ro.observe(map.getContainer())
    window.addEventListener('resize', fix)
    window.addEventListener('orientationchange', fix)
    window.visualViewport?.addEventListener('resize', fix)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      ro.disconnect()
      window.removeEventListener('resize', fix)
      window.removeEventListener('orientationchange', fix)
      window.visualViewport?.removeEventListener('resize', fix)
    }
  }, [map])
  return null
}

export interface MapCanvasProps {
  hotspots: ApiHotspot[]
  runners: ApiUser[]
  me: LatLng
  myName: string
  available: boolean
  onSelectHotspot: (h: ApiHotspot) => void
  onSelectRunner: (u: ApiUser) => void
}

export default function MapCanvas({
  hotspots,
  runners,
  me,
  myName,
  available,
  onSelectHotspot,
  onSelectRunner,
}: MapCanvasProps) {
  const clusters = buildClusters(runners)

  return (
    <MapContainer
      center={[me.lat, me.lng]}
      zoom={14}
      scrollWheelZoom
      zoomControl={false}
      className="h-full w-full"
      style={{ background: 'oklch(0.96 0.01 220)' }}
    >
      <MapResizeFix />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      {/* Hotspots — true coordinates, stacked while they overlap on screen */}
      <HotspotMarkers hotspots={hotspots} onSelectHotspot={onSelectHotspot} />

      {/* Runners with cluster-zoom behaviour */}
      <RunnerMarkers clusters={clusters} onSelectRunner={onSelectRunner} />

      {/* You */}
      <Marker position={[me.lat, me.lng]} icon={youIcon(myName, available)} />

      <RecentreControl me={me} />
    </MapContainer>
  )
}
