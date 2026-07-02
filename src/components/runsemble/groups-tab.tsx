'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Users, Lock, Globe, Send, ArrowLeft, Plus, MessageCircle, ChevronRight, Play } from 'lucide-react'
import { useRunsembleStore } from '@/lib/store'
import { apiGet } from '@/lib/api'
import type { ApiGroup, ApiGroupMessage, GroupsResponse, GroupResponse, GroupMessagesResponse } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDistanceToNow } from 'date-fns'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

export function GroupsTab() {
  const { currentUser, selectedGroupId, setSelectedGroupId, groupView, setGroupView, openRunTracker } = useRunsembleStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPublic, setNewPublic] = useState(true)
  const queryClient = useQueryClient()

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiGet<GroupsResponse>(`/api/groups?userId=${currentUser?.id}`),
  })

  const groups: ApiGroup[] = groupsData?.groups ?? []

  const { data: selectedGroupData, isLoading: groupLoading } = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => apiGet<GroupResponse>(`/api/groups/${selectedGroupId}`),
    enabled: !!selectedGroupId,
  })

  const selectedGroup: ApiGroup | null = selectedGroupData?.group ?? null

  const { data: messagesData, isLoading: chatLoading } = useQuery({
    queryKey: ['group-chat', selectedGroupId],
    queryFn: () => apiGet<GroupMessagesResponse>(`/api/groups/${selectedGroupId}/chat`),
    enabled: !!selectedGroupId && groupView === 'chat',
  })

  const messages: ApiGroupMessage[] = messagesData?.messages ?? []

  const [chatMsg, setChatMsg] = useState('')

  // Keep the chat pinned to the newest message.
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (groupView === 'chat' && messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [messages, groupView])

  const joinMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'join' | 'leave' }) =>
      fetch(`/api/groups/${id}/join${action === 'leave' ? `?userId=${currentUser?.id}` : ''}`, {
        method: action === 'join' ? 'POST' : 'DELETE',
        headers: action === 'join' ? { 'Content-Type': 'application/json' } : undefined,
        body: action === 'join' ? JSON.stringify({ userId: currentUser?.id }) : undefined,
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  })

  const createMutation = useMutation({
    mutationFn: () => fetch('/api/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc, isPublic: newPublic, city: 'Antwerp', createdBy: currentUser?.id }),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['groups'] }); setCreateOpen(false); setNewName(''); setNewDesc('') },
  })

  const sendMsgMutation = useMutation({
    mutationFn: (content: string) => fetch(`/api/groups/${selectedGroupId}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: currentUser?.id, content }),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-chat', selectedGroupId] }); setChatMsg('') },
  })

  // Detail view
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
    return (
      <div>
        <button onClick={() => { setGroupView('list'); setSelectedGroupId(null) }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to groups
        </button>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div><h2 className="text-xl font-bold">{selectedGroup.name}</h2><p className="text-sm text-muted-foreground mt-1">{selectedGroup.description}</p></div>
            <Badge variant={selectedGroup.isPublic ? 'default' : 'secondary'}>{selectedGroup.isPublic ? <><Globe className="h-3 w-3 mr-1" />Public</> : <><Lock className="h-3 w-3 mr-1" />Private</>}</Badge>
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
          {/* Members */}
          <div><h3 className="font-semibold text-sm mb-2">Members</h3>
            <div className="space-y-2">
              {selectedGroup.members?.map((m) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8"><AvatarFallback className={`text-xs text-white ${getAvatarColor(m.user?.name || 'U')}`}>{getInitials(m.user?.name || 'U')}</AvatarFallback></Avatar>
                  <span className="text-sm font-medium flex-1">{m.user?.name}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Chat view
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
          <Input value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Type a message..." className="rounded-full" onKeyDown={e => e.key === 'Enter' && chatMsg.trim() && sendMsgMutation.mutate(chatMsg)} />
          <Button size="icon" className="rounded-full flex-shrink-0" onClick={() => chatMsg.trim() && sendMsgMutation.mutate(chatMsg)}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    )
  }

  // List view
  if (isLoading) {
    return (
      <div className="space-y-3 pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        {[1,2,3].map(i => (<Card key={i}><CardContent className="p-4"><div className="space-y-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-1/3" /></div></CardContent></Card>))}
      </div>
    )
  }

  const myGroups = groups.filter((g) => g.isMember)
  const discoverGroups = groups.filter((g) => !g.isMember && g.isPublic)

  if (myGroups.length === 0 && discoverGroups.length === 0) {
    return (
      <div className="space-y-5 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Groups</h2>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Create</Button>
        </div>
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No groups yet. Create one to get started!
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Groups</h2>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Create</Button>
      </div>

      {myGroups.length > 0 && (
        <div><h3 className="text-sm font-semibold text-muted-foreground mb-2">My Groups</h3><div className="space-y-2">
          {myGroups.map((g) => (
            <motion.div key={g.id} {...fadeUp}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSelectedGroupId(g.id); setGroupView('detail') }}>
                <CardContent className="p-4"><div className="flex items-start justify-between"><div className="flex-1"><div className="flex items-center gap-2"><h4 className="font-semibold text-sm">{g.name}</h4><Badge variant="secondary" className="text-[10px]">{g.memberCount}</Badge></div><p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p><p className="text-xs text-muted-foreground mt-1">{g.totalKmThisWeek?.toFixed(0)} km this week</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></div></CardContent>
              </Card>
            </motion.div>
          ))}
        </div></div>
      )}

      {discoverGroups.length > 0 && (
        <div><h3 className="text-sm font-semibold text-muted-foreground mb-2">Discover</h3><div className="space-y-2">
          {discoverGroups.map((g) => (
            <motion.div key={g.id} {...fadeUp}>
              <Card className="hover:shadow-md transition-shadow"><CardContent className="p-4"><div className="flex items-start justify-between"><div className="flex-1 cursor-pointer" onClick={() => { setSelectedGroupId(g.id); setGroupView('detail') }}><div className="flex items-center gap-2"><h4 className="font-semibold text-sm">{g.name}</h4>{g.isPublic ? <Globe className="h-3 w-3 text-muted-foreground" /> : <Lock className="h-3 w-3 text-muted-foreground" />}</div><p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p><p className="text-xs text-muted-foreground mt-1">{g.memberCount} members &middot; {g.totalKmThisWeek?.toFixed(0)} km/week</p></div><Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => joinMutation.mutate({ id: g.id, action: 'join' })}>Join</Button></div></CardContent></Card>
            </motion.div>
          ))}
        </div></div>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}><SheetContent side="bottom" className="rounded-t-3xl"><SheetHeader><SheetTitle>Create a Group</SheetTitle></SheetHeader>
        <div className="space-y-4 p-4">
          <div><Label>Group Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Friday Night Runners" className="mt-1.5" /></div>
          <div><Label>Description</Label><Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What's your group about?" className="mt-1.5" rows={3} /></div>
          <div className="flex items-center justify-between"><Label>Public Group</Label><Switch checked={newPublic} onCheckedChange={setNewPublic} /></div>
          <Button className="w-full rounded-full" onClick={() => createMutation.mutate()} disabled={!newName.trim()}>Create Group</Button>
        </div>
      </SheetContent></Sheet>
    </div>
  )
}