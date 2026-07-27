'use client'

// Live recording map for the run tracker — Strava-style: your current position,
// the start point, and the route drawing in real time as you move. Client-only
// (Leaflet touches window), loaded via next/dynamic.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from '@/lib/map-tiles'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '@/lib/geo'

// Keeps the map centered on the runner as they move. Primitives as props so the
// recenter effect only fires when the coordinates actually change.
function FollowPosition({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true })
  }, [lat, lng, map])
  return null
}

// Your live position: brand-orange dot with a white ring and a soft pulse.
const currentDot = L.divIcon({
  className: 'rs-divicon',
  html: `
    <div style="position:relative;width:22px;height:22px;">
      <span class="rs-pulse" style="position:absolute;inset:-8px;border-radius:999px;background:rgba(249,115,22,.25);"></span>
      <div style="position:relative;width:22px;height:22px;border-radius:999px;background:#14b8a6;border:3.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35);"></div>
    </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

export interface LiveRunMapProps {
  /** Map focus when there's no GPS fix yet (user's home coords or city centre). */
  center: LatLng
  /** Latest GPS position, if any. */
  current: LatLng | null
  /** The recorded route so far; index 0 is the start point. */
  path: LatLng[]
}

export default function LiveRunMap({ center, current, path }: LiveRunMapProps) {
  const focus = current ?? center
  const start = path[0]

  return (
    <MapContainer
      center={[focus.lat, focus.lng]}
      zoom={16}
      zoomControl={false}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: 'oklch(0.96 0.01 220)' }}
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={TILE_MAX_ZOOM} />

      {/* Route so far */}
      {path.length >= 2 && (
        <Polyline
          positions={path.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: '#14b8a6', weight: 5, opacity: 0.95 }}
        />
      )}

      {/* Start point */}
      {start && (
        <CircleMarker
          center={[start.lat, start.lng]}
          radius={7}
          pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#10b981', fillOpacity: 1 }}
        />
      )}

      {/* You, right now */}
      {current && <Marker position={[current.lat, current.lng]} icon={currentDot} />}

      <FollowPosition lat={focus.lat} lng={focus.lng} />
    </MapContainer>
  )
}
