'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Loader2, Plus, Trash2, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api'
import { readPosition } from '@/lib/use-location-refresh'
import { MAX_SAFE_ZONES } from '@/lib/safe-zones'
import { LIMITS } from '@/lib/limits'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// The settings surface for safe zones. The backend and the map suppression
// already shipped; without this, a user could never actually create one. Adding
// a zone is the one place a location prompt is expected — the user is asking to
// hide somewhere — so allowPrompt is true here.
//
// Naming and radius are surfaced because this is a promise the user has to be
// able to check: an unlabelled list of "Home" entries tells them nothing about
// whether the place they meant is actually covered.

interface Zone {
  id: string
  name: string
  lat: number
  lng: number
  radiusM: number
}

const NAME_PRESETS = ['Home', 'Work', 'Gym', 'Custom'] as const
type Preset = (typeof NAME_PRESETS)[number]

/** Inside the band clampZoneRadius enforces; the server clamps regardless. */
const RADIUS_OPTIONS = [200, 500, 1000]

function formatRadius(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`
}

export function SafeZonesCard() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [preset, setPreset] = useState<Preset>('Home')
  const [customName, setCustomName] = useState('')
  const [radiusM, setRadiusM] = useState(500)

  const { data, isLoading } = useQuery({
    queryKey: ['safe-zones'],
    queryFn: () => apiGet<{ zones: Zone[] }>('/api/safe-zones'),
  })
  const zones = data?.zones ?? []
  const atCap = zones.length >= MAX_SAFE_ZONES
  const name = preset === 'Custom' ? customName.trim() : preset

  const reset = () => {
    setComposing(false)
    setPreset('Home')
    setCustomName('')
    setRadiusM(500)
  }

  const add = async () => {
    setBusy(true)
    const coords = await readPosition({ allowPrompt: true })
    if (!coords) {
      toast.error("Couldn't get your location")
      setBusy(false)
      return
    }
    try {
      const res = await fetch('/api/safe-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, radiusM, ...coords }),
      })
      if (res.ok) {
        // Name the place and the distance back, so the confirmation is checkable
        // rather than a vague "done".
        toast.success(`${name} is hidden — nothing shows within ${formatRadius(radiusM)}`)
        qc.invalidateQueries({ queryKey: ['safe-zones'] })
        reset()
      } else {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Could not add a safe zone')
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (zone: Zone) => {
    const res = await fetch(`/api/safe-zones/${zone.id}`, { method: 'DELETE' })
    if (res.ok) {
      // Removing one un-hides a place, so say which one lost its cover.
      toast.success(`${zone.name} is no longer hidden`)
      qc.invalidateQueries({ queryKey: ['safe-zones'] })
    } else {
      toast.error('Could not remove it')
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Safe zones</p>
            <p className="text-xs text-muted-foreground">
              Places you&rsquo;re never shown on the map — home, work, the gym. Others just see nothing there.
            </p>
          </div>
        </div>

        {zones.length > 0 ? (
          <div className="space-y-1.5">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5">
                <EyeOff className="h-4 w-4 text-primary shrink-0" />
                <p className="flex-1 min-w-0 truncate text-sm font-medium">
                  {z.name}
                  <span className="font-normal text-muted-foreground"> · {formatRadius(z.radiusM)}</span>
                </p>
                <button
                  onClick={() => remove(z)}
                  aria-label={`Remove ${z.name}`}
                  className="text-muted-foreground/60 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          !isLoading && (
            <p className="text-xs text-muted-foreground">No safe zones yet — nothing is being hidden.</p>
          )
        )}

        {composing ? (
          <div className="rounded-xl border p-3 space-y-3">
            <div>
              <p className="text-xs font-medium mb-1.5">What is this place?</p>
              <div className="grid grid-cols-4 gap-1.5">
                {NAME_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={preset === p}
                    onClick={() => setPreset(p)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      preset === p
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/60'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {preset === 'Custom' && (
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Name this place"
                  maxLength={LIMITS.name}
                  className="mt-1.5"
                  autoFocus
                />
              )}
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">How much to hide</p>
              <div className="grid grid-cols-3 gap-1.5">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={radiusM === r}
                    onClick={() => setRadiusM(r)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      radiusM === r
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/60'
                    }`}
                  >
                    {formatRadius(r)}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Everything within {formatRadius(radiusM)} of where you&rsquo;re standing now stays hidden — no pin,
              not even an approximate one.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" className="rounded-full" onClick={add} disabled={busy || !name}>
                {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Hide this place
              </Button>
            </div>
          </div>
        ) : atCap ? (
          <p className="text-xs text-muted-foreground">
            All {MAX_SAFE_ZONES} safe zones are in use. Remove one to add another.
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full"
            onClick={() => setComposing(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Hide where I am now
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
