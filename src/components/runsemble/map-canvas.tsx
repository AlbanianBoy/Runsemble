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
// Loaded via next/dynamic with { ssr: false } from map-tab.

import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { Fragment, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ANTWERP_CENTER, fuzzCoord, type LatLng } from '@/lib/geo'
import type { ApiHotspot, ApiUser } from '@/lib/types'
import { getAvatarHex } from './helpers'

// How close two fuzzed coordinates must be (in degrees) to be treated as the
// same cluster. 0.002° ≈ 200 m, matching the fuzz grid cell size.
const CLUSTER_THRESHOLD = 0.002

// Pin colour comes from the shared avatar palette (no violet/pink, and the same
// hash) so a runner's map pin matches their avatar everywhere else in the app.
const colorForName = getAvatarHex

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function hotspotIcon(count: number): L.DivIcon {
  const badge =
    count > 0
      ? `<span style="position:absolute;top:-6px;right:-6px;background:#ea580c;color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:999px;padding:0 3px;border:1.5px solid #fff;">${count}</span>`
      : ''
  return L.divIcon({
    className: 'rs-divicon',
    html: `
      <div style="position:relative;width:30px;height:30px;">
        <span class="rs-pulse" style="position:absolute;inset:-9px;border-radius:999px;background:rgba(249,115,22,.25);"></span>
        <div style="position:relative;width:30px;height:30px;border-radius:999px;background:#14b8a6;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
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

function clusterIcon(count: number, color: string): L.DivIcon {
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
    const fuzzed = fuzzCoord({ lat: u.lat, lng: u.lng }, 200)
    const key = clusterKey(fuzzed.lat, fuzzed.lng)
    if (map.has(key)) {
      map.get(key)!.runners.push(u)
    } else {
      map.set(key, { key, lat: fuzzed.lat, lng: fuzzed.lng, runners: [u] })
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />

      {/* Hotspots — true coordinates */}
      {hotspots.map((h) => (
        <Marker
          key={h.id}
          position={[h.lat, h.lng]}
          icon={hotspotIcon(h.participantCount)}
          eventHandlers={{ click: () => onSelectHotspot(h) }}
        />
      ))}

      {/* Runners with cluster-zoom behaviour */}
      <RunnerMarkers clusters={clusters} onSelectRunner={onSelectRunner} />

      {/* You */}
      <Marker position={[me.lat, me.lng]} icon={youIcon(myName, available)} />
    </MapContainer>
  )
}
