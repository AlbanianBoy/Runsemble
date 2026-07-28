'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Users, Lock, Globe, Send, ArrowLeft, Plus, MessageCircle, ChevronRight, Play, Settings, Shield, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useRunsembleStore } from '@/lib/store'
import { showMutationError } from '@/lib/mutation-error'
import { apiGet, apiGetSilent, apiSend } from '@/lib/api'
import { useIdleBackoffPoll, useVisiblePoll } from '@/lib/use-visible-poll'
import type { ApiGroup, ApiGroupMessage, GroupsResponse, GroupResponse, GroupMessagesResponse, BuddiesResponse, ConversationsResponse, MessageRequestsResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { getAvatarColor, getInitials } from './helpers'
import { BuddiesView } from './buddies-view'
import { EmptyState } from './empty-state'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

function timeAgo(iso: string): string {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: false }) } catch { return '' }
}

export function GroupsTab() {
  const { currentUser, selectedGroupId, setSelectedGroupId, groupView, setGroupView, openRunTracker, openDm, setUnreadDmCount } = useRunsembleStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPublic, setNewPublic] = useState(true)
  const [showBuddies, setShowBuddies] = useState(false)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const {
    data: groupsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['groups', query],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiGet<GroupsResponse>(
        `/api/groups?${new URLSearchParams({
          ...(query ? { q: query } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        })}`
      ),
    getNextPageParam: (last) => last.nextCursor ?? null,
  })

  const { data: convData } = useQuery({
    queryKey: ['conversations', currentUser?.id],
    queryFn: () => apiGetSilent<ConversationsResponse>('/api/messages'),
    enabled: !!currentUser?.id,
    refetchInterval: useIdleBackoffPoll(15_000),
    retry: false,
    throwOnError: false,
  })

  const conversations = convData?.conversations ?? []

  // Requests are people you have no connection to who wrote anyway. They are
  // deliberately NOT in `conversations` — the inbox is the thing they have not
  // been let into — so they need their own list or the message is invisible.
  const { data: requestData } = useQuery({
    queryKey: ['message-requests', currentUser?.id],
    queryFn: () => apiGetSilent<MessageRequestsResponse>('/api/messages/requests'),
    enabled: !!currentUser?.id,
    retry: false,
    throwOnError: false,
  })
  const messageRequests = requestData?.requests ?? []

  const answerRequest = useMutation({
    mutationFn: ({ senderId, action }: { senderId: string; action: 'accept' | 'decline' }) =>
      apiSend('/api/messages/requests', 'PATCH', { senderId, action }),
    onSuccess: (_r, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['message-requests'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      // Nothing is said to the other person either way. Accepting shows up when
      // they get a reply; declining is meant to be invisible.
      if (action === 'accept') toast.success('Message accepted')
    },
    onError: (e: Error) => showMutationError(e),
  })

  const lastUnreadTotal = useRef<number>(-1)
  useEffect(() => {
    const total = conversations.reduce((sum, c) => sum + (c.unread ?? 0), 0)
    if (total !== lastUnreadTotal.current) {
      lastUnreadTotal.current = total
      setUnreadDmCount(total)
    }
  })

  const groups: ApiGroup[] = groupsPages?.pages.flatMap((p) => p.groups) ?? []
  const scopedToCity = groupsPages?.pages[0]?.scopedToCity ?? null

  const { data: selectedGroupData, isLoading: groupLoading } = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => apiGet<GroupResponse>(`/api/groups/${selectedGroupId}`),
    enabled: !!selectedGroupId,
  })

  const selectedGroup: ApiGroup | null = selectedGroupData?.group ?? null

  const chatPoll = useVisiblePoll(5000)

  const { data: messagesData } = useQuery({
    queryKey: ['group-chat', selectedGroupId],
    queryFn: () => apiGet<GroupMessagesResponse>(`/api/groups/${selectedGroupId}/chat`),
    enabled: !!selectedGroupId && groupView === 'chat',
    refetchInterval: groupView === 'chat' && selectedGroupId ? chatPoll : false,
  })

  const messages: ApiGroupMessage[] = messagesData?.messages ?? []

  const [chatMsg, setChatMsg] = useState('')

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (groupView === 'chat' && messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages, groupView])

  const joinMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      apiSend<GroupResponse>(`/api/groups/${id}/join`, action === 'join' ? 'POST' : 'DELETE'),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group', id] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiSend<GroupResponse>('/api/groups', 'POST', {
        name: newName, description: newDesc, isPublic: newPublic, city: 'Antwerp',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setCreateOpen(false); setNewName(''); setNewDesc('')
      toast.success('Group created 🎉')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sendMsgMutation = useMutation({
    mutationFn: (content: string) =>
      apiSend<{ message: ApiGroupMessage }>(`/api/groups/${selectedGroupId}/chat`, 'POST', { content }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-chat', selectedGroupId] }); setChatMsg('') },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleSendMsg = () => {
    const content = chatMsg.trim()
    if (!content || sendMsgMutation.isPending) return
    sendMsgMutation.mutate(content)
  }

  const [inviteOpen, setInviteOpen] = useState(false)
  const { data: buddiesData } = useQuery({
    queryKey: ['buddies', currentUser?.id],
    queryFn: () => apiGet<BuddiesResponse>(`/api/buddies?userId=${currentUser?.id}`),
    enabled: inviteOpen && !!currentUser?.id,
  })
  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => apiSend(`/api/groups/${selectedGroupId}/members`, 'POST', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroupId] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Added to the group')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [manageOpen, setManageOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPublic, setEditPublic] = useState(true)
  // ── AlertDialog state ──
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ userId: string; name: string } | null>(null)
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false)

  const editGroup = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiSend(`/api/groups/${selectedGroupId}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', selectedGroupId] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group updated')
      setManageOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const deleteGroup = useMutation({
    mutationFn: () => apiSend(`/api/groups/${selectedGroupId}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      toast.success('Group deleted')
      setManageOpen(false)
      setGroupView('list')
      setSelectedGroupId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const removeMember = useMutation({
    mutationFn: (userId: string) => apiSend(`/api/groups/${selectedGroupId}/members/${userId}`, 'DELETE'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group', selectedGroupId] }); toast.success('Member removed') },
    onError: (e: Error) => toast.error(e.message),
  })
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      apiSend(`/api/groups/${selectedGroupId}/members/${userId}`, 'PATCH', { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group', selectedGroupId] }),
    onError: (e: Error) => toast.error(e.message),
  })

  // Buddies moved here from the profile — entered from the main Social list.
  if (showBuddies) return <BuddiesView onBack={() => setShowBuddies(false)} />

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (groupView === 'detail') {
    if (groupLoading || !selectedGroup) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-4"><Skeleton className="h-16 flex-1 rounded-xl" /><Skeleton className="h-16 flex-1 rounded-xl" /><Skeleton className="h-16 flex-1 rounded-xl" /></div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      )
    }
    const isMember = selectedGroup.members?.some((m) => m.userId === currentUser?.id)
    const memberIds = new Set(selectedGroup.members?.map((m) => m.userId) ?? [])
    const inviteCandidates = (buddiesData?.buddies ?? []).filter((b) => !memberIds.has(b.id))
    const myRole = selectedGroup.members?.find((m) => m.userId === currentUser?.id)?.role
    const canManage = myRole === 'owner' || myRole === 'admin'
    const isOwner = myRole === 'owner'
    const openManage = () => {
      setEditName(selectedGroup.name)
      setEditDesc(selectedGroup.description ?? '')
      setEditPublic(!!selectedGroup.isPublic)
      setManageOpen(true)
    }
    return (
      <div>
        <button onClick={() => { setGroupView('list'); setSelectedGroupId(null) }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to groups
        </button>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="text-xl font-bold">{selectedGroup.name}</h2><p className="text-sm text-muted-foreground mt-1">{selectedGroup.description}</p></div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={selectedGroup.isPublic ? 'default' : 'secondary'}>{selectedGroup.isPublic ? <><Globe className="h-3 w-3 mr-1" />Public</> : <><Lock className="h-3 w-3 mr-1" />Private</>}</Badge>
              {canManage && (
                <button onClick={openManage} aria-label="Manage group" className="text-muted-foreground hover:text-foreground transition-colors">
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-4 text-center">
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-mono text-2xl font-bold tabular leading-none">{selectedGroup.memberCount}</p><p className="text-xs text-muted-foreground">members</p></div>
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-mono text-2xl font-bold tabular leading-none">{selectedGroup.totalKmThisWeek?.toFixed(0)}</p><p className="text-xs text-muted-foreground">km this week</p></div>
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-mono text-2xl font-bold tabular leading-none">{selectedGroup.totalMessages || 0}</p><p className="text-xs text-muted-foreground">messages</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setGroupView('chat')}><MessageCircle className="h-4 w-4 mr-2" />Chat</Button>
            {isMember ? (
              <Button className="flex-1 rounded-xl" onClick={() => openRunTracker({ groupId: selectedGroup.id, label: selectedGroup.name })}>
                <Play className="h-4 w-4 mr-2" fill="currentColor" />Start run
              </Button>
            ) : (
              <Button className="flex-1 rounded-xl" onClick={() => joinMutation.mutate({ id: selectedGroup.id!, action: 'join' })}>Join Group</Button>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Members</h3>
              {isMember && (
                <button onClick={() => setInviteOpen(true)} className="text-xs text-primary font-medium flex items-center gap-1 hover:opacity-80 transition-opacity">
                  <Plus className="h-3.5 w-3.5" />Add people
                </button>
              )}
            </div>
            <div className="space-y-2">
              {selectedGroup.members?.map((m) => {
                const isSelf = m.userId === currentUser?.id
                const canRemove = !isSelf && m.role !== 'owner' && (isOwner || (canManage && m.role === 'member'))
                const canToggleRole = isOwner && !isSelf && m.role !== 'owner'
                return (
                  <div key={m.userId} className="flex items-center gap-3">
                    <Avatar className="h-8 w-8"><AvatarFallback className={`text-xs text-white ${getAvatarColor(m.user?.name || 'U')}`}>{getInitials(m.user?.name || 'U')}</AvatarFallback></Avatar>
                    <span className="text-sm font-medium flex-1 truncate">{m.user?.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                    {canToggleRole && (
                      <button
                        onClick={() => changeRole.mutate({ userId: m.userId, role: m.role === 'admin' ? 'member' : 'admin' })}
                        disabled={changeRole.isPending}
                        aria-label={m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        className={`transition-colors ${m.role === 'admin' ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => setRemoveMemberTarget({ userId: m.userId, name: m.user?.name ?? 'this member' })}
                        disabled={removeMember.isPending}
                        aria-label="Remove member"
                        className="text-muted-foreground/60 hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Remove member confirmation */}
        <AlertDialog open={!!removeMemberTarget} onOpenChange={(o) => { if (!o) setRemoveMemberTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove member?</AlertDialogTitle>
              <AlertDialogDescription>
                {removeMemberTarget?.name} will be removed from the group. They can rejoin if the group is public.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (removeMemberTarget) removeMember.mutate(removeMemberTarget.userId)
                  setRemoveMemberTarget(null)
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle>Add people to {selectedGroup.name}</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-2 max-h-[55vh] overflow-y-auto pb-6">
              {inviteCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No one to add yet — your run buddies show up here.
                </p>
              ) : (
                inviteCandidates.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(b.name)}`}>{getInitials(b.name)}</AvatarFallback></Avatar>
                    <span className="text-sm font-medium flex-1">{b.name}</span>
                    <Button size="sm" variant="outline" className="rounded-full" disabled={addMemberMutation.isPending} onClick={() => addMemberMutation.mutate(b.id)}>Add</Button>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={manageOpen} onOpenChange={setManageOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader><SheetTitle>Manage group</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4 pb-6">
              <div className="space-y-1.5">
                <Label htmlFor="grp-name" className="text-xs">Name</Label>
                <Input id="grp-name" value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grp-desc" className="text-xs">Description</Label>
                <Textarea id="grp-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="rounded-xl" rows={3} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Public group</p>
                  <p className="text-xs text-muted-foreground">Anyone can find and join it</p>
                </div>
                <Switch checked={editPublic} onCheckedChange={setEditPublic} />
              </div>
              <Button
                className="w-full rounded-full"
                disabled={editGroup.isPending || !editName.trim()}
                onClick={() => editGroup.mutate({ name: editName.trim(), description: editDesc.trim(), isPublic: editPublic })}
              >
                Save changes
              </Button>
              {isOwner && (
                <button
                  onClick={() => setDeleteGroupOpen(true)}
                  disabled={deleteGroup.isPending}
                  className="w-full text-center text-xs text-destructive/80 hover:text-destructive transition-colors pt-1 flex items-center justify-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />Delete group
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Delete group confirmation */}
        <AlertDialog open={deleteGroupOpen} onOpenChange={setDeleteGroupOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete group?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>{selectedGroup.name}</strong> for all members. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { setDeleteGroupOpen(false); deleteGroup.mutate() }}
              >
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ── Chat view ────────────────────────────────────────────────────────────────
  if (groupView === 'chat') {
    if (!selectedGroup) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-140px)]">
          <Skeleton className="h-4 w-32" />
        </div>
      )
    }
    return (
      <div className="flex flex-col h-[calc(100vh-140px)]">
        <button onClick={() => setGroupView('detail')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"><ArrowLeft className="h-4 w-4" />{selectedGroup.name}</button>
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                  {!isMe && <p className="text-xs font-semibold mb-0.5 opacity-70">{msg.sender?.name}</p>}
                  <p>{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-2 pt-2 border-t">
          <Input value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Type a message..." className="rounded-full" onKeyDown={e => { if (e.key === 'Enter') handleSendMsg() }} />
          <Button size="icon" disabled={sendMsgMutation.isPending || !chatMsg.trim()} className="rounded-full flex-shrink-0" onClick={handleSendMsg}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        {[1, 2, 3].map(i => (<Card key={i}><CardContent className="p-4"><div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/3" /></div></CardContent></Card>))}
      </div>
    )
  }

  const myGroups = groups.filter((g) => g.isMember)
  const discoverGroups = groups.filter((g) => !g.isMember && g.isPublic)

  return (
    <div className="space-y-5 pb-4">
      {/* Buddies live here now (moved from the profile) — the people you've run
          with belong with the rest of your social graph, not in "you". */}
      <button
        onClick={() => setShowBuddies(true)}
        className="w-full rounded-2xl border border-border/60 bg-card p-3 flex items-center gap-3 text-left hover:shadow-md transition-shadow"
      >
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Your buddies</p>
          <p className="text-[11px] text-muted-foreground">People you&rsquo;ve run with</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {messageRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            Message requests
            <span className="ml-1.5 text-muted-foreground/70 tabular">{messageRequests.length}</span>
          </h3>
          <div className="space-y-2">
            {messageRequests.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className={`text-sm text-white ${getAvatarColor(r.sender.name)}`}>
                        {getInitials(r.sender.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.sender.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {r.sender.city} · {r.sender.paceLevel}
                      </p>
                      {/* The message itself, not just who sent it — being asked
                          to accept before seeing what was said is not a choice. */}
                      <p className="text-sm mt-1.5 line-clamp-3">{r.preview}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1 rounded-full min-h-11"
                      onClick={() => answerRequest.mutate({ senderId: r.sender.id, action: 'accept' })}
                      disabled={answerRequest.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-full min-h-11"
                      onClick={() => answerRequest.mutate({ senderId: r.sender.id, action: 'decline' })}
                      disabled={answerRequest.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {conversations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Messages</h3>
          <div className="space-y-1">
            {conversations.map((c) => (
              <motion.button
                key={c.partner.id}
                {...fadeUp}
                onClick={() => openDm(c.partner)}
                className="w-full flex items-center gap-3 rounded-2xl p-2.5 hover:bg-muted/60 active:bg-muted transition-colors text-left"
              >
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarFallback className={`text-sm text-white ${getAvatarColor(c.partner.name)}`}>
                    {getInitials(c.partner.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${c.unread > 0 ? 'font-bold' : 'font-medium'}`}>{c.partner.name}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className={`text-xs truncate ${c.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {c.lastMessage}
                  </p>
                </div>
                {c.unread > 0 && (
                  <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                    {c.unread > 9 ? '9+' : c.unread}
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Groups</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Create</Button>
      </div>

      {myGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">My Groups</h3>
          <div className="space-y-2">
            {myGroups.map((g) => (
              <motion.div key={g.id} {...fadeUp}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedGroupId(g.id); setGroupView('detail') }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{g.name}</h4>
                          <Badge variant="secondary" className="text-[10px]">{g.memberCount}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{g.totalKmThisWeek?.toFixed(0)} km this week</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Discover</h3>
          {scopedToCity && (
            <span className="text-[11px] text-muted-foreground shrink-0">in {scopedToCity}</span>
          )}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups by name…"
          aria-label="Search groups by name"
          className="mb-3 rounded-full"
        />

        {discoverGroups.length === 0 && !isLoading && (
          <EmptyState icon={<Users />} title={query ? 'No matches' : 'No groups here yet'}>
            {query
              ? `No groups match "${query}".`
              : scopedToCity
                ? `No ${myGroups.length > 0 ? 'other ' : ''}groups in ${scopedToCity} yet — widen your search, or start one.`
                : `No ${myGroups.length > 0 ? 'other ' : ''}groups to join yet — create one to get started.`}
          </EmptyState>
        )}

        {discoverGroups.length > 0 && (
          <div className="space-y-2">
            {discoverGroups.map((g) => (
              <motion.div key={g.id} {...fadeUp}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 cursor-pointer" onClick={() => { setSelectedGroupId(g.id); setGroupView('detail') }}>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-sm">{g.name}</h4>
                          {g.isPublic ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{g.memberCount} members · {g.totalKmThisWeek?.toFixed(0)} km/week</p>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => joinMutation.mutate({ id: g.id, action: 'join' })}>Join</Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <Button
            variant="outline"
            className="w-full rounded-full mt-3"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading…' : 'Show more groups'}
          </Button>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader><SheetTitle>Create a Group</SheetTitle></SheetHeader>
          <div className="space-y-4 p-4">
            <div><Label>Group Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Friday Night Runners" className="mt-1.5" /></div>
            <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What's your group about?" className="mt-1.5" rows={3} /></div>
            <div className="flex items-center justify-between"><Label>Public Group</Label><Switch checked={newPublic} onCheckedChange={setNewPublic} /></div>
            <Button className="w-full rounded-full" onClick={() => createMutation.mutate()} disabled={!newName.trim()}>Create Group</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
