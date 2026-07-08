'use client'

// ─── MapCanvas ────────────────────────────────────────────────────────────────
// The real, geographic map at the heart of Runsemble. Renders an OpenStreetMap
// basemap (CARTO Voyager tiles — free, no API key) and plots:
//   • hotspots at their true lat/lng
//   • nearby available runners at PRIVACY-FUZZED coordinates (~200m grid) with a
//     soft "approximate area" circle, exactly as the concept promises
//   • the current user's own position
//
// Loaded via next/dynamic with { ssr: false } from map-tab, because Leaflet
// touches `window` and must never run during server rendering.

import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import { Fragment } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ANTWERP_CENTER, fuzzCoord, type LatLng } from '@/lib/geo'
import type { ApiHotspot, ApiUser } from '@/lib/types'

// Hex palette mirroring helpers.getAvatarColor order, so a person's colour on
// the map matches their colour everywhere else in the app. (Tailwind utility
// classes aren't reliable inside Leaflet-injected markup, so we use hex here.)
const HEX_COLORS = [
  '#14b8a6', '#d97706', '#059669', '#f43f5e', '#8b5cf6',
  '#14b8a6', '#ec4899', '#ca8a04', '#ef4444', '#0891b2',
]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return HEX_COLORS[Math.abs(hash) % HEX_COLORS.length]
}

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

      {/* Nearby runners — privacy-fuzzed to a ~200m grid + approximate-area halo */}
      {runners.map((u) => {
        if (u.lat == null || u.lng == null) return null
        const fuzzed = fuzzCoord({ lat: u.lat, lng: u.lng }, 200)
        return (
          <Fragment key={u.id}>
            <Circle
              center={[fuzzed.lat, fuzzed.lng]}
              radius={200}
              pathOptions={{ color: colorForName(u.name), weight: 1, opacity: 0.35, fillOpacity: 0.08 }}
            />
            <Marker
              position={[fuzzed.lat, fuzzed.lng]}
              icon={avatarIcon(u.name)}
              eventHandlers={{ click: () => onSelectRunner(u) }}
            />
          </Fragment>
        )
      })}

      {/* You */}
      <Marker position={[me.lat, me.lng]} icon={youIcon(myName, available)} />
    </MapContainer>
  )
}
