'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Send, MessageCircle, Loader2 } from 'lucide-react'
import { newClientId } from '@/lib/client-id'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type { ApiComment, CommentsResponse } from '@/lib/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'

// Comment thread for a single feed post. Opened from the post's comment button.
export function CommentsSheet({
  postId,
  open,
  onOpenChange,
}: {
  postId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { currentUser } = useRunsembleStore()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => apiGet<CommentsResponse>(`/api/feed/${postId}/comments`),
    enabled: open && !!postId,
  })

  const comments: ApiComment[] = data?.comments ?? []

  // One id per comment being written; replaced only once it has landed.
  const draftId = useRef(newClientId())

  const addComment = useMutation({
    mutationFn: (content: string) =>
      apiSend(`/api/feed/${postId}/comments`, 'POST', {
        authorId: currentUser?.id,
        content,
        clientId: draftId.current,
      }),
    onSuccess: () => {
      setText('')
      draftId.current = newClientId()
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  function submit() {
    if (text.trim() && currentUser?.id) addComment.mutate(text.trim())
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl h-[75dvh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2"><MessageCircle className="h-4 w-4" />Comments</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : comments.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No comments yet.</p>
              <p className="text-xs mt-1">Be the first to say something.</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={`text-[10px] text-white ${getAvatarColor(c.author?.name || 'U')}`}>{getInitials(c.author?.name || 'U')}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
                    <p className="text-xs font-semibold">{c.author?.name}</p>
                    <p className="text-sm leading-snug whitespace-pre-wrap break-words">{c.content}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-1">{timeAgo(c.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 p-3 border-t bg-background">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="rounded-full"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Button size="icon" className="rounded-full shrink-0" onClick={submit} disabled={!text.trim() || addComment.isPending}>
            {addComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}
