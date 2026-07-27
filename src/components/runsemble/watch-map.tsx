'use client'

// The map a worried contact stares at. One marker — where the runner is — plus
// the accuracy circle, and nothing else: no route trail (that would trace the
// runner's whole path for anyone the link reaches), no other people. Mirrors
// live-run-map.tsx's Leaflet setup so the two read as the same product.
//
// When the fix has gone stale the marker greys out, so "this dot is old" is
// visible on the map itself and not only in the text above it.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from '@/lib/map-tiles'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Keep the runner centred as they move. Primitive props so the effect only fires
// when the coordinates actually change.
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true })
  }, [lat, lng, map])
  return null
}

function dot(color: string, ring: string) {
  return L.divIcon({
    className: 'rs-divicon',
    html: `<div style="width:22px;height:22px;border-radius:999px;background:${color};border:3.5px solid ${ring};box-shadow:0 1px 5px rgba(0,0,0,.35);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}
const liveIcon = dot('#14b8a6', '#ffffff') // brand teal — a fresh fix
const staleIcon = dot('#94a3b8', '#e2e8f0') // slate — an old one

export interface WatchMapProps {
  lat: number
  lng: number
  /** GPS accuracy in metres, drawn as a circle; null when unknown. */
  accuracyM: number | null
  /** The last fix is older than the freshness window — grey the marker. */
  stale: boolean
}

export default function WatchMap({ lat, lng, accuracyM, stale }: WatchMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      zoomControl={false}
      scrollWheelZoom
      className="h-full w-full"
      style={{ background: 'oklch(0.96 0.01 220)' }}
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={TILE_MAX_ZOOM} />

      {accuracyM != null && accuracyM > 0 && (
        <Circle
          center={[lat, lng]}
          radius={accuracyM}
          pathOptions={{
            color: stale ? '#94a3b8' : '#14b8a6',
            weight: 1,
            fillColor: stale ? '#94a3b8' : '#14b8a6',
            fillOpacity: 0.12,
          }}
        />
      )}

      <Marker position={[lat, lng]} icon={stale ? staleIcon : liveIcon} />
      <Recenter lat={lat} lng={lng} />
    </MapContainer>
  )
}
