'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import { useVisiblePoll } from '@/lib/use-visible-poll'
import type { NotificationsResponse } from '@/lib/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getAvatarColor, getInitials } from './helpers'

// The notification inbox, opened from the header bell. Polls every 20s while the
// tab is visible so the unread badge stays fresh, and marks everything read when
// opened. This one is mounted app-wide, so pausing it when hidden matters most.
export function NotificationsSheet() {
  const { currentUser, notificationsOpen, setNotificationsOpen, setUnreadCount } = useRunsembleStore()
  const queryClient = useQueryClient()
  const userId = currentUser?.id

  const { data } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => apiGet<NotificationsResponse>(`/api/notifications?userId=${userId}`),
    enabled: !!userId,
    refetchInterval: useVisiblePoll(20_000),
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

  // Mark read shortly after the sheet opens.
  useEffect(() => {
    if (notificationsOpen && data && data.unread > 0) {
      const t = setTimeout(() => markAll.mutate(), 600)
      return () => clearTimeout(t)
    }
  }, [notificationsOpen, data, markAll])

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
            <div className="flex flex-col items-center justify-center h-full text-center px-6 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No notifications yet.</p>
              <p className="text-xs mt-1">Join a run or track your first run to get started.</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div key={n.id} className={`flex items-start gap-3 p-4 ${n.read ? '' : 'bg-primary/5'}`}>
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
                </div>
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
