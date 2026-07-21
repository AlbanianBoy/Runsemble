'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Users, Lock, Globe, Send, ArrowLeft, Plus, MessageCircle, ChevronRight, Play, Settings, Shield, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useRunsembleStore } from '@/lib/store'
import { apiGet, apiGetSilent, apiSend } from '@/lib/api'
import { useVisiblePoll } from '@/lib/use-visible-poll'
import type { ApiGroup, ApiGroupMessage, GroupsResponse, GroupResponse, GroupMessagesResponse, BuddiesResponse, ConversationsResponse } from '@/lib/types'
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
import { getAvatarColor, getInitials } from './helpers'

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
  const queryClient = useQueryClient()

  // Discover is paged, so the tab no longer pulls every group in the database
  // on open. Page 1 carries your groups plus the first slice of Discover;
  // later pages are Discover only (the server drops "mine" once a cursor is
  // present, so the flattened list can't duplicate them).
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

  // DM conversations — use apiGetSilent so a 401 never triggers the global
  // reload loop. retry:false + throwOnError:false means an error just gives an
  // empty list rather than crashing the whole tab.
  const { data: convData } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiGetSilent<ConversationsResponse>('/api/messages'),
    enabled: !!currentUser?.id,
    refetchInterval: useVisiblePoll(15_000),
    retry: false,
    throwOnError: false,
  })

  const conversations = convData?.conversations ?? []

  // Keep the Groups-tab badge in sync with actual unread count.
  // We track the last-synced total in a ref so we only call setUnreadDmCount
  // when the number actually changes — calling it on every render would create
  // an infinite update loop (store update → re-render → effect → store update…).
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

  // Hoisted out of the ternary below because hooks can't be called
  // conditionally — the *condition* stays in the query, this only supplies the
  // interval it uses when the chat is open.
  const chatPoll = useVisiblePoll(5000)

  const { data: messagesData } = useQuery({
    queryKey: ['group-chat', selectedGroupId],
    queryFn: () => apiGet<GroupMessagesResponse>(`/api/groups/${selectedGroupId}/chat`),
    enabled: !!selectedGroupId && groupView === 'chat',
    // Poll while the chat is open so new messages arrive — the same fallback the
    // DM thread uses. A push invalidates this key too when one lands. Open but
    // hidden is still not open to a human, so chatPoll goes false there too.
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
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-bold text-lg">{selectedGroup.memberCount}</p><p className="text-xs text-muted-foreground">members</p></div>
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-bold text-lg">{selectedGroup.totalKmThisWeek?.toFixed(0)}</p><p className="text-xs text-muted-foreground">km this week</p></div>
            <div className="flex-1 bg-muted/50 rounded-xl p-3"><p className="font-bold text-lg">{selectedGroup.totalMessages || 0}</p><p className="text-xs text-muted-foreground">messages</p></div>
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
                        onClick={() => { if (confirm(`Remove ${m.user?.name} from the group?`)) removeMember.mutate(m.userId) }}
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
                  onClick={() => { if (confirm('Delete this group for everyone? This cannot be undone.')) deleteGroup.mutate() }}
                  disabled={deleteGroup.isPending}
                  className="w-full text-center text-xs text-destructive/80 hover:text-destructive transition-colors pt-1 flex items-center justify-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />Delete group
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
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
      {/* ── Direct Messages ──────────────────────────────────────────────────── */}
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

      {/* ── Groups ───────────────────────────────────────────────────────────── */}
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
          {/* Say which city you're browsing, so an empty list reads as "none
              here" rather than "none anywhere" — and so searching, which drops
              the city scope, is an obvious way out. */}
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

        {/* One empty state, not two: this is the only place a "nothing here"
            card appears, so a brand-new account doesn't get a stack of them. */}
        {discoverGroups.length === 0 && !isLoading && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            <Users className="h-7 w-7 mx-auto mb-2 text-muted-foreground/50" />
            {query
              ? `No groups match “${query}”.`
              : scopedToCity
                ? `No ${myGroups.length > 0 ? 'other ' : ''}groups in ${scopedToCity} yet — search to look further afield, or create one.`
                : `No ${myGroups.length > 0 ? 'other ' : ''}groups to join yet — create one to get started.`}
          </CardContent></Card>
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
