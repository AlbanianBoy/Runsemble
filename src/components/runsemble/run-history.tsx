'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Clock, Zap, Flame, Play } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet } from '@/lib/api'
import { ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts'
import { formatClock, formatPaceLabel, shortDate, parsePath, parseSplits } from '@/lib/run'
import type { RunsResponse, ApiRunSession } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

export function RunHistory() {
  const { currentUser, setProfileView, openRunTracker } = useRunsembleStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['runs', currentUser?.id],
    queryFn: () => apiGet<RunsResponse>(`/api/runs?userId=${currentUser?.id}`),
    enabled: !!currentUser?.id,
  })

  const runs: ApiRunSession[] = data?.runs ?? []
  const totalDist = runs.reduce((s, r) => s + r.distanceKm, 0)

  // Km per day over the last 7 days, for the little bar chart.
  const chartData: { day: string; km: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    dayStart.setDate(dayStart.getDate() - i)
    const dayEnd = dayStart.getTime() + 86_400_000
    const km = runs
      .filter((r) => {
        const t = new Date(r.endedAt).getTime()
        return t >= dayStart.getTime() && t < dayEnd
      })
      .reduce((s, r) => s + r.distanceKm, 0)
    chartData.push({
      day: dayStart.toLocaleDateString(undefined, { weekday: 'short' }),
      km: Math.round(km * 10) / 10,
    })
  }

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => setProfileView('main')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Your Runs</h2>
        <Button size="sm" className="rounded-full" onClick={() => openRunTracker({ label: 'Solo run' })}>
          <Play className="h-4 w-4 mr-1" fill="currentColor" />Start
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : runs.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Flame className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No tracked runs yet. Hit Start to log your first one!
        </CardContent></Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="gradient-brand-subtle p-4 flex items-center justify-around text-center">
              <div><p className="text-lg font-bold tabular">{runs.length}</p><p className="text-[11px] text-muted-foreground">runs</p></div>
              <div><p className="text-lg font-bold tabular">{totalDist.toFixed(1)}</p><p className="text-[11px] text-muted-foreground">km logged</p></div>
              <div><p className="text-lg font-bold tabular">{Math.round(runs.reduce((s, r) => s + r.durationSec, 0) / 60)}</p><p className="text-[11px] text-muted-foreground">minutes</p></div>
            </div>
            {/* Last 7 days */}
            <div className="px-3 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Last 7 days (km)
              </p>
            </div>
            <div className="h-28 px-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    stroke="currentColor"
                    opacity={0.5}
                  />
                  <Bar dataKey="km" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-2">
            {runs.map((r) => {
              const open = expandedId === r.id
              const pts = open ? parsePath(r.path) : []
              const splits = open ? parseSplits(r.splits) : []
              return (
                <Card key={r.id} className="overflow-hidden">
                  <button className="w-full text-left" onClick={() => setExpandedId(open ? null : r.id)}>
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sm">{r.hotspot?.name ?? r.group?.name ?? 'Solo run'}</p>
                        <span className="text-xs text-muted-foreground">{shortDate(r.endedAt)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.distanceKm.toFixed(2)} km</span>
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatClock(r.durationSec)}</span>
                        <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" />{formatPaceLabel(r.avgPaceSecPerKm)}</span>
                        <span className="ml-auto text-primary font-semibold">+{r.xpEarned} XP</span>
                      </div>
                    </CardContent>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5">
                      {pts.length >= 2 && (
                        <div className="h-36 rounded-xl overflow-hidden border mb-3"><RouteMap points={pts} /></div>
                      )}
                      {splits.length > 0 ? (
                        <div className="space-y-1">
                          {splits.map((s, i) => {
                            const max = Math.max(...splits)
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-6 text-muted-foreground tabular">{i + 1}k</span>
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(15, (s / max) * 100)}%` }} /></div>
                                <span className="tabular w-12 text-right">{formatClock(s)}</span>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        pts.length < 2 && <p className="text-xs text-muted-foreground text-center py-2">No GPS route recorded for this run.</p>
                      )}
                      {r.companions > 0 && <p className="text-[11px] text-muted-foreground mt-2">Ran with {r.companions} {r.companions === 1 ? 'person' : 'people'}</p>}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
