'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api'
import { readPosition } from '@/lib/use-location-refresh'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// The settings surface for safe zones. The backend and the map suppression
// already shipped; without this, a user could never actually create one. Adding
// a zone is the one place a location prompt is expected — the user is asking to
// hide somewhere — so allowPrompt is true here.

interface Zone {
  id: string
  name: string
  lat: number
  lng: number
  radiusM: number
}

export function SafeZonesCard() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({
    queryKey: ['safe-zones'],
    queryFn: () => apiGet<{ zones: Zone[] }>('/api/safe-zones'),
  })
  const zones = data?.zones ?? []

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
        body: JSON.stringify({ name: 'Home', ...coords }),
      })
      if (res.ok) {
        toast.success("Safe zone added — you're hidden here now")
        qc.invalidateQueries({ queryKey: ['safe-zones'] })
      } else {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Could not add a safe zone')
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/safe-zones/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Safe zone removed')
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

        {zones.length > 0 && (
          <div className="space-y-1.5">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-xl border px-3 py-2">
                <span className="text-sm font-medium">{z.name}</span>
                <button
                  onClick={() => remove(z.id)}
                  aria-label={`Remove ${z.name}`}
                  className="text-muted-foreground/60 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full rounded-full" onClick={add} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
          Hide me around my current location
        </Button>
      </CardContent>
    </Card>
  )
}
