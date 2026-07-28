'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { useIdleBackoffPoll } from '@/lib/use-visible-poll'
import { tabForPush, isDmPush, queryKeysForPush } from '@/lib/push-routing'
import type { ApiNotification, NotificationsResponse } from '@/lib/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { EmptyState } from './empty-state'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'

// The notification inbox, opened from the header bell. Polls every 20s while the
// tab is visible so the unread badge stays fresh, and marks everything read when
// opened. This one is mounted app-wide, so pausing it when hidden matters most.
//
// Rows route through src/lib/push-routing.ts — the same table usePushNotifications
// uses for a tapped push. One notification should mean the same thing whether you
// tap it on the lock screen or in this list; two tables would guarantee it didn't.
export function NotificationsSheet() {
  const { currentUser, notificationsOpen, setNotificationsOpen, setUnreadCount, setActiveTab, openDm, dmPartner } = useRunsembleStore()
  const queryClient = useQueryClient()
  const userId = currentUser?.id

  const { data } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => apiGet<NotificationsResponse>(`/api/notifications?userId=${userId}`),
    enabled: !!userId,
    // Runs on every screen, unlike every other poll here, so it dominates the
    // steady-state request rate. Backs off while the bell stays quiet.
    refetchInterval: useIdleBackoffPoll(20_000),
  })

  const notifications = data?.notifications ?? []

  // Keep the header badge in sync with the server's unread count.
  useEffect(() => {
    if (data) setUnreadCount(data.unread)
  }, [data, setUnreadCount])

  const markAll = useMutation({
    mutationFn: () => apiSend('/api/notifications', 'PATCH', { userId }),
    onSuccess: () => {
      setUnreadCount(0)
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] })
    },
  })

  const markRead = useMutation({
    mutationFn: (ids: string[]) => apiSend('/api/notifications', 'PATCH', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
  })

  // The poll keeps handing back the same still-unread rows until the PATCH lands
  // and the refetch catches up; without this ledger every replay fires again.
  const submitted = useRef<Set<string>>(new Set())
  const markReadOnce = (ids: string[]) => {
    const fresh = ids.filter((id) => !submitted.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) submitted.current.add(id)
    markRead.mutate(fresh)
  }

  // Mark read shortly after the sheet opens.
  useEffect(() => {
    if (notificationsOpen && data && data.unread > 0) {
      const t = setTimeout(() => markAll.mutate(), 600)
      return () => clearTimeout(t)
    }
  }, [notificationsOpen, data, markAll])

  // ── One tally wins for DM unread ────────────────────────────────────────────
  // A DM used to be counted twice, by two systems that then drifted: the bell
  // counts 'group_message' notification rows, the Groups badge counts unread
  // messages. Opening the thread cleared the messages and left the bell insisting
  // the DM was still waiting.
  //
  // The messages are the source of truth — opening a thread is what "read"
  // actually means, and the server already marks them on the way in. Notification
  // rows are a log of what happened, not a second inbox, so they follow: opening
  // a thread marks that sender's DM notifications read too.
  const dmPartnerId = dmPartner?.id
  useEffect(() => {
    if (!dmPartnerId) return
    markReadOnce(
      notifications
        .filter((n) => n.type === 'group_message' && !n.read && n.actor?.id === dmPartnerId)
        .map((n) => n.id)
    )
  }, [dmPartnerId, notifications])

  // Tapping a row does what tapping the push does: go where the thing is, and
  // refresh what it made stale. tabForPush always answers, so a type we've never
  // seen lands on a real screen instead of leaving the row inert.
  const openNotification = (n: ApiNotification) => {
    if (!n.read) markReadOnce([n.id])

    for (const key of queryKeysForPush(n.type)) {
      // Prefix match: keys are ['conversations', userId] and the like.
      queryClient.invalidateQueries({ queryKey: [key] })
    }
    setActiveTab(tabForPush(n.type))

    const actor = n.actor
    if (actor && isDmPush({ type: n.type, senderId: actor.id, senderName: actor.name })) {
      openDm({ id: actor.id, name: actor.name })
    }

    setNotificationsOpen(false)
  }

  return (
    <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="flex items-center gap-2"><Bell className="h-4 w-4" />Notifications</SheetTitle>
          {notifications.some((n) => !n.read) && (
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => markAll.mutate()}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" />Mark all read
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState className="h-full" icon={<Bell />} title="No notifications yet">
              Join a run or track your first one — updates from people you run with land here.
            </EmptyState>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`w-full text-left flex items-start gap-3 p-4 transition-colors hover:bg-muted/60 active:bg-muted ${n.read ? '' : 'bg-primary/5'}`}
                >
                  {n.actor ? (
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={`text-xs text-white ${getAvatarColor(n.actor.name)}`}>{getInitials(n.actor.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-lg">{n.icon ?? '🔔'}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                </button>
              ))}
            </div>
          )}
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
