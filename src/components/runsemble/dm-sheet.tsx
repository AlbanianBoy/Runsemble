'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2 } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { ApiDirectMessage, DmThreadResponse } from '@/lib/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'

// A 1:1 direct-message thread. Opened from anywhere via store.openDm(partner)
// and mounted once globally. Polls while open so replies appear.
export function DmSheet() {
  const { currentUser, dmPartner, closeDm } = useRunsembleStore()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const me = currentUser?.id
  const partnerId = dmPartner?.id

  const { data } = useQuery({
    queryKey: ['dm', me, partnerId],
    queryFn: () => apiGet<DmThreadResponse>(`/api/messages?userId=${me}&withId=${partnerId}`),
    enabled: !!me && !!partnerId,
    refetchInterval: 5000,
  })
  const messages: ApiDirectMessage[] = data?.messages ?? []

  const send = useMutation({
    mutationFn: (content: string) => apiSend('/api/messages', 'POST', { senderId: me, recipientId: partnerId, content }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['dm', me, partnerId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', me] })
    },
    onError: (e: Error) => { /* surfaced inline; keep text */ void e },
  })

  const submit = () => { if (text.trim() && me && partnerId) send.mutate(text.trim()) }

  return (
    <Sheet open={!!dmPartner} onOpenChange={(o) => { if (!o) closeDm() }}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[80dvh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-row items-center gap-3 space-y-0">
          {dmPartner && (
            <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(dmPartner.name)}`}>{getInitials(dmPartner.name)}</AvatarFallback></Avatar>
          )}
          <SheetTitle>{dmPartner?.name}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Say hi 👋 — plan your next run together.</p>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === me
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                    {m.content}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-2 p-3 border-t bg-background">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" className="rounded-full" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <Button size="icon" className="rounded-full shrink-0" onClick={submit} disabled={!text.trim() || send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
