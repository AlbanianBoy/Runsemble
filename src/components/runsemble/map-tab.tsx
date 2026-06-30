'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Clock, Users, Navigation } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { getAvatarColor, getInitials } from './helpers'

const HOTSPOT_POSITIONS = [
  { x: 25, y: 30 }, { x: 65, y: 20 }, { x: 45, y: 55 },
  { x: 80, y: 45 }, { x: 20, y: 70 }, { x: 55, y: 80 },
]

const RUNNER_POSITIONS = [
  { x: 35, y: 25 }, { x: 70, y: 35 }, { x: 15, y: 50 },
  { x: 60, y: 65 }, { x: 40, y: 40 },
]

export function MapTab() {
  const { currentUser, isAvailable, setAvailability } = useRunsembleStore()
  const [selectedHotspot, setSelectedHotspot] = useState<any>(null)
  const [selectedRunner, setSelectedRunner] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: hotspots } = useQuery({ queryKey: ['hotspots'], queryFn: () => fetch('/api/hotspots').then(r => r.json()) })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => fetch('/api/users').then(r => r.json()) })

  const availableRunners = users?.filter((u: any) => u.isAvailable && u.id !== currentUser?.id) || []

  const joinMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      fetch(`/api/hotspots/${id}/join`, { method: action === 'join' ? 'POST' : 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hotspots'] }),
  })

  return (
    <div className="relative h-[calc(100vh-140px)]">
      <div className="absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-green-50/50 to-teal-50">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'linear-gradient(rgba(0,0,0,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <path d="M 50 0 Q 200 150 180 300 Q 160 450 300 600" stroke="rgba(0,0,0,0.06)" strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M 400 100 Q 250 200 200 350 Q 150 500 50 600" stroke="rgba(0,0,0,0.06)" strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M 0 300 Q 100 250 200 300 Q 300 350 400 300" stroke="rgba(0,0,0,0.06)" strokeWidth="8" fill="none" strokeLinecap="round" />
        </svg>

        {/* Hotspot markers */}
        {hotspots?.map((h: any, i: number) => {
          const pos = HOTSPOT_POSITIONS[i % HOTSPOT_POSITIONS.length]
          return (
            <motion.button
              key={h.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              whileHover={{ scale: 1.2 }}
              onClick={() => setSelectedHotspot(h)}
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-orange-400/30 animate-hotspot-pulse" style={{ width: 48, height: 48, margin: -12 }} />
                <div className="w-6 h-6 rounded-full bg-orange-500 border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="w-3 h-3 text-white" />
                </div>
                {h.participantCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{h.participantCount}</div>
                )}
              </div>
            </motion.button>
          )
        })}

        {/* Runner markers */}
        {availableRunners.map((u: any, i: number) => {
          const pos = RUNNER_POSITIONS[i % RUNNER_POSITIONS.length]
          return (
            <motion.button
              key={u.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ left: `${pos.x + 5}%`, top: `${pos.y + 5}%` }}
              whileHover={{ scale: 1.2 }}
              onClick={() => setSelectedRunner(u)}
            >
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white">
                <div className={`w-full h-full rounded-full ${getAvatarColor(u.name)} flex items-center justify-center`}>{getInitials(u.name)}</div>
              </div>
            </motion.button>
          )
        })}

        {/* You marker */}
        {currentUser && (
          <div className="absolute" style={{ left: '48%', top: '48%', transform: 'translate(-50%, -50%)' }}>
            <div className="relative">
              <div className={`w-10 h-10 rounded-full border-3 border-white shadow-lg flex items-center justify-center text-xs font-bold text-white ${isAvailable ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                {getInitials(currentUser.name)}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${isAvailable ? 'bg-emerald-400' : 'bg-gray-300'}`} />
            </div>
          </div>
        )}
      </div>

      {/* Availability toggle */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <Button
          size="lg"
          className={`rounded-full shadow-xl font-semibold px-6 ${isAvailable ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-primary hover:bg-primary/90'}`}
          onClick={() => setAvailability(!isAvailable, 45)}
        >
          <Navigation className={`h-4 w-4 mr-2 ${isAvailable ? 'animate-pulse' : ''}`} />
          {isAvailable ? 'Available Now' : 'Go Available'}
        </Button>
      </div>

      {/* Hotspot detail sheet */}
      <Sheet open={!!selectedHotspot} onOpenChange={() => setSelectedHotspot(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {selectedHotspot && (
            <div className="p-4 space-y-4">
              <SheetHeader><SheetTitle>{selectedHotspot.name}</SheetTitle><SheetDescription>{selectedHotspot.location}</SheetDescription></SheetHeader>
              <div className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{selectedHotspot.minutesUntil} min</span>
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{selectedHotspot.distanceKm}km</span>
                <span className="flex items-center gap-1"><Users className="h-4 w-4" />{selectedHotspot.participantCount} joined</span>
              </div>
              {selectedHotspot.description && <p className="text-sm">{selectedHotspot.description}</p>}
              {selectedHotspot.participantNames?.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {selectedHotspot.participantNames.slice(0, 5).map((name: string, i: number) => (
                      <Avatar key={i} className="w-7 h-7 border-2 border-background"><AvatarFallback className={`text-[9px] text-white ${getAvatarColor(name)}`}>{getInitials(name)}</AvatarFallback></Avatar>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{selectedHotspot.participantNames.join(', ')}</span>
                </div>
              )}
              <Button className="w-full rounded-full font-semibold" onClick={() => { joinMutation.mutate({ id: selectedHotspot.id, action: 'join' }); setSelectedHotspot(null) }}>
                Join This Run
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Runner profile sheet */}
      <Sheet open={!!selectedRunner} onOpenChange={() => setSelectedRunner(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {selectedRunner && (
            <div className="p-4 space-y-3 text-center">
              <Avatar className="h-16 w-16 mx-auto"><AvatarFallback className={`text-lg text-white ${getAvatarColor(selectedRunner.name)}`}>{getInitials(selectedRunner.name)}</AvatarFallback></Avatar>
              <div><p className="font-bold text-lg">{selectedRunner.name}</p><p className="text-sm text-muted-foreground">{selectedRunner.city} &middot; {selectedRunner.paceLevel}</p></div>
              {selectedRunner.bio && <p className="text-sm">{selectedRunner.bio}</p>}
              <div className="flex justify-center gap-4 text-sm">
                <div className="text-center"><p className="font-bold">{selectedRunner.totalRuns}</p><p className="text-xs text-muted-foreground">runs</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.totalPeopleRunWith}</p><p className="text-xs text-muted-foreground">run buddies</p></div>
                <div className="text-center"><p className="font-bold">{selectedRunner.streak}</p><p className="text-xs text-muted-foreground">streak</p></div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}