'use client'

// A tiny read-only Leaflet map that draws a recorded GPS route as a polyline and
// fits the view to it. Client-only (Leaflet touches window). Used on the run
// finish summary and in run history.

import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from '@/lib/map-tiles'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '@/lib/geo'
import { ANTWERP_CENTER } from '@/lib/geo'

export interface RouteMapProps {
  points: LatLng[]
  className?: string
}

function bounds(points: LatLng[]): [[number, number], [number, number]] | undefined {
  if (points.length < 2) return undefined
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
  }
  return [[minLat, minLng], [maxLat, maxLng]]
}

export default function RouteMap({ points }: RouteMapProps) {
  const b = bounds(points)
  const center = points.length > 0 ? points[Math.floor(points.length / 2)] : ANTWERP_CENTER
  const latlngs = points.map((p) => [p.lat, p.lng] as [number, number])
  const start = points[0]
  const end = points[points.length - 1]

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      bounds={b}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      zoomControl={false}
      dragging={false}
      doubleClickZoom={false}
      className="h-full w-full"
      style={{ background: 'oklch(0.96 0.01 220)' }}
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={TILE_MAX_ZOOM} referrerPolicy="no-referrer" />
      {latlngs.length >= 2 && (
        <Polyline positions={latlngs} pathOptions={{ color: '#14b8a6', weight: 5, opacity: 0.9 }} />
      )}
      {start && <CircleMarker center={[start.lat, start.lng]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 1 }} />}
      {end && points.length > 1 && <CircleMarker center={[end.lat, end.lng]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }} />}
    </MapContainer>
  )
}
