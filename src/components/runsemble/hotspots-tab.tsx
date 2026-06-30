'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Clock, MapPin, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

export function HotspotsTab() {
  const [expanded, setExpanded] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: hotspots, isLoading } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => fetch('/api/hotspots').then(r => r.json()),
  })

  const joinMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      fetch(`/api/hotspots/${id}/join`, { method: action === 'join' ? 'POST' : 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotspots'] }),
  })

  if (isLoading) return (
    <div className="space-y-3">{[1,2,3].map(i => (<Card key={i}><CardContent className="p-4"><div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full rounded-lg" /></div></CardContent></Card>))}</div>
  )

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold">Upcoming Runs</h2>
        <Badge variant="secondary" className="text-xs">{hotspots?.length || 0} available</Badge>
      </div>
      {hotspots?.map((h: any) => (
        <motion.div key={h.id} {...fadeUp}>
          <Card className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${h.minutesUntil < 30 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                      {h.minutesUntil <= 0 ? 'Starting!' : `in ${h.minutesUntil} min`}
                    </span>
                    <span className="text-xs text-muted-foreground">{h.distanceKm}km</span>
                  </div>
                  <h3 className="font-semibold text-sm">{h.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <MapPin className="h-3 w-3" />{h.location}
                  </div>
                </div>
                <Button
                  size="sm"
                  className={`rounded-full text-xs ${h.participantNames?.length > 0 ? '' : ''}`}
                  variant={h.joined ? 'secondary' : 'default'}
                  onClick={() => joinMutation.mutate({ id: h.id, action: h.joined ? 'leave' : 'join' })}
                >
                  {h.joined ? 'Joined' : 'Join'}
                </Button>
              </div>

              {/* Participants preview */}
              {h.participantNames?.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex -space-x-2">
                    {h.participantNames.slice(0, 4).map((name: string, i: number) => (
                      <Avatar key={i} className="w-6 h-6 border-2 border-background"><AvatarFallback className={`text-[8px] text-white ${getAvatarColor(name)}`}>{getInitials(name)}</AvatarFallback></Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{h.participantCount} {h.participantCount === 1 ? 'person' : 'people'} joining</span>
                </div>
              )}

              {/* Expandable description */}
              {h.description && (
                <>
                  <button onClick={() => setExpanded(expanded === h.id ? null : h.id)} className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground transition-colors">
                    {expanded === h.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expanded === h.id ? 'Less' : 'More details'}
                  </button>
                  {expanded === h.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 text-sm text-muted-foreground">
                      {h.description}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />Pace: {h.paceRange}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Every {h.recurringIntervalMin} min</span>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}