'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Flag, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { format, isToday, isYesterday } from 'date-fns'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { useVisiblePoll } from '@/lib/use-visible-poll'
import type { ApiDirectMessage, DmThreadResponse } from '@/lib/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'
import { ReportSheet } from './report-sheet'

// A 1:1 direct-message thread. Opened from anywhere via store.openDm(partner)
// and mounted once globally. Polls while open — and only while the tab is
// visible, so a thread left open in a background tab costs nothing.
export function DmSheet() {
  const { currentUser, dmPartner, closeDm } = useRunsembleStore()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const me = currentUser?.id
  const partnerId = dmPartner?.id

  const { data } = useQuery({
    queryKey: ['dm', me, partnerId],
    queryFn: () => apiGet<DmThreadResponse>(`/api/messages?userId=${me}&withId=${partnerId}`),
    enabled: !!me && !!partnerId,
    refetchInterval: useVisiblePoll(5000),
  })
  const messages: ApiDirectMessage[] = data?.messages ?? []

  // Pin the thread to the newest message.
  const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = useMutation({
    mutationFn: (content: string) => apiSend('/api/messages', 'POST', { senderId: me, recipientId: partnerId, content }),
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['dm', me, partnerId] })
      queryClient.invalidateQueries({ queryKey: ['conversations', me] })
    },
    onError: (e: Error) => { /* surfaced inline; keep text */ void e },
  })

  const submit = () => { if (text.trim() && me && partnerId && !send.isPending) send.mutate(text.trim()) }

  // L23 — find the last outgoing message that the recipient has read, so we
  // can render a "Seen" receipt beneath it. Only the most-recent read message
  // gets the label; earlier ones are implicitly read and don't need clutter.
  const lastReadIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === me && messages[i].read) return i
    }
    return -1
  })()

  return (
    <>
    <Sheet open={!!dmPartner} onOpenChange={(o) => { if (!o) closeDm() }}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[80dvh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-row items-center gap-3 space-y-0">
          {dmPartner && (
            <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(dmPartner.name)}`}>{getInitials(dmPartner.name)}</AvatarFallback></Avatar>
          )}
          <SheetTitle>{dmPartner?.name}</SheetTitle>
          <button
            onClick={() => setReportOpen(true)}
            aria-label={`Report or block ${dmPartner?.name ?? 'this person'}`}
            className="ml-auto text-muted-foreground/70 hover:text-destructive transition-colors p-1 -m-1"
          >
            <Flag className="h-4 w-4" />
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Say hi 👋 — plan your next run together.</p>
          ) : (
            messages.map((m, idx) => {
              const mine = m.senderId === me
              const showReceipt = mine && idx === lastReadIndex
              return (
                <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                    {m.content}
                  </div>
                  {/* L23 — per-message timestamp, small and unobtrusive */}
                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1 select-none">
                    {formatMsgTime(m.createdAt)}
                  </span>
                  {/* L23 — read receipt: shown only beneath the last outgoing
                      message the recipient has opened. */}
                  {showReceipt && (
                    <span className="flex items-center gap-0.5 text-[10px] text-primary/70 -mt-0.5 px-1 select-none">
                      <CheckCheck className="h-3 w-3" />
                      Seen
                    </span>
                  )}
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-center gap-2 p-3 border-t bg-background">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…" className="rounded-full" onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <Button size="icon" className="rounded-full shrink-0" onClick={submit} disabled={!text.trim() || send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    {/* Report or block the person you're talking to — filing implies a block. */}
    <ReportSheet
      open={reportOpen}
      onOpenChange={setReportOpen}
      subjectType="user"
      subjectId={partnerId ?? null}
      subjectLabel={dmPartner?.name}
      onReported={() => {
        if (!partnerId || !me) return
        apiSend(`/api/users/${partnerId}/block`, 'POST', { blockerId: me, reason: 'reported from chat' })
          .then(() => {
            toast.success(`${dmPartner?.name ?? 'This person'} blocked`)
            queryClient.invalidateQueries({ queryKey: ['conversations', me] })
            closeDm()
          })
          .catch(() => toast.error('Reported, but could not block — try again'))
      }}
    />
    </>
  )
}

/**
 * L23 — Format a message's createdAt into a human-friendly string:
 *   today    → "14:32"
 *   yesterday → "Yesterday 14:32"
 *   older    → "Mon 14:32"
 */
function formatMsgTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`
    return format(d, 'EEE HH:mm')
  } catch {
    return ''
  }
}
