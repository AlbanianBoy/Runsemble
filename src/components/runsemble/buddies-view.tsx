'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, Users, MessageCircle, UserMinus } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { BuddiesResponse, ConversationsResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './empty-state'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getAvatarColor, getInitials } from './helpers'

// Buddies + direct-message inbox — the relationship layer that keeps people
// running together.
export function BuddiesView({ onBack }: { onBack?: () => void }) {
  const { currentUser, setProfileView, openDm } = useRunsembleStore()
  const uid = currentUser?.id
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  // Leaving a buddy list used to require blocking the person — a hostile,
  // permanent answer to "I don't really know them". This is the quiet exit:
  // both rows go, nobody is told.
  const removeBuddy = useMutation({
    mutationFn: (buddyId: string) => apiSend('/api/buddies', 'DELETE', { buddyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buddies'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRemoving(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data: buddiesData, isLoading } = useQuery({
    queryKey: ['buddies', uid],
    queryFn: () => apiGet<BuddiesResponse>(`/api/buddies?userId=${uid}`),
    enabled: !!uid,
  })
  const { data: convData } = useQuery({
    queryKey: ['conversations', uid],
    queryFn: () => apiGet<ConversationsResponse>(`/api/messages?userId=${uid}`),
    enabled: !!uid,
  })

  const buddies = buddiesData?.buddies ?? []
  const conversations = convData?.conversations ?? []

  return (
    <div className="space-y-5 pb-4">
      <button onClick={onBack ?? (() => setProfileView('main'))} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Conversations */}
      {conversations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Messages</h3>
          <div className="space-y-1.5">
            {conversations.map((c) => (
              <button key={c.partner.id} onClick={() => openDm(c.partner)} className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/60 transition-colors text-left">
                <Avatar className="h-10 w-10"><AvatarFallback className={`text-xs text-white ${getAvatarColor(c.partner.name)}`}>{getInitials(c.partner.name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{c.partner.name}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                </div>
                {c.unread > 0 && <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{c.unread}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Buddies */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Run Buddies</h2>
          <span className="text-xs text-muted-foreground">{buddies.length}</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : buddies.length === 0 ? (
          <EmptyState icon={<Users />} title="No run buddies yet">
            Run with someone, then tag them at the finish — they&rsquo;ll show up here as a buddy you can message and invite again.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {buddies.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-11 w-11"><AvatarFallback className={`text-sm text-white ${getAvatarColor(b.name)}`}>{getInitials(b.name)}</AvatarFallback></Avatar>
                    {b.isAvailable && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{b.city} · {b.paceLevel} · 🔥 {b.streak}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => openDm({ id: b.id, name: b.name })}>
                    <MessageCircle className="h-4 w-4 mr-1" />Message
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11 rounded-full text-muted-foreground hover:text-destructive shrink-0"
                    aria-label={`Remove ${b.name} as a run buddy`}
                    onClick={() => setRemoving({ id: b.id, name: b.name })}
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name} as a run buddy?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be removed from both of your buddy lists. Nobody is notified, and you
              can tag each other again after a future run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && removeBuddy.mutate(removing.id)}
              disabled={removeBuddy.isPending}
            >
              {removeBuddy.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function timeAgo(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: false }) } catch { return '' }
}
