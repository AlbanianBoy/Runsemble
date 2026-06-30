'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle } from 'lucide-react'
import { useRunsembleStore, getRankFromXP } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

export function FeedTab() {
  const queryClient = useQueryClient()
  const { currentUser } = useRunsembleStore()
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [newPostContent, setNewPostContent] = useState('')

  const { data: feedData, isLoading } = useQuery({ queryKey: ['feed'], queryFn: () => fetch('/api/feed').then(r => r.json()) })
  const { data: hotspotsData } = useQuery({ queryKey: ['hotspots'], queryFn: () => fetch('/api/hotspots').then(r => r.json()) })
  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: () => fetch('/api/users').then(r => r.json()) })

  const posts = (feedData as any)?.posts || []
  const hotspots = (hotspotsData as any)?.hotspots || []
  const users = (usersData as any)?.users || []

  const nextHotspot = hotspots?.find((h: any) => h.minutesUntil > 0)
  const availableRunners = users?.filter((u: any) => u.isAvailable && u.id !== currentUser?.id) || []
  const rank = currentUser ? getRankFromXP(currentUser.xp) : null

  const likeMutation = useMutation({
    mutationFn: (postId: string) => fetch(`/api/feed/${postId}/like`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feed'] }),
  })

  const postMutation = useMutation({
    mutationFn: (content: string) => fetch('/api/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId: currentUser?.id, content, postType: 'moment' }),
    }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['feed'] }); setPostDialogOpen(false); setNewPostContent('') },
  })

  function timeAgo(dateStr: string) {
    try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true }) } catch { return '' }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {nextHotspot && (
          <Card className="min-w-[250px] flex-shrink-0 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" /></span>
                <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Next Run</span>
              </div>
              <p className="font-semibold text-sm leading-tight mb-1">{nextHotspot.name}</p>
              <p className="text-xs text-muted-foreground">starts in {nextHotspot.minutesUntil} min &middot; {nextHotspot.participantCount} joining</p>
            </CardContent>
          </Card>
        )}
        {currentUser && rank && (
          <Card className="min-w-[150px] flex-shrink-0 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
            <CardContent className="p-3.5 text-center">
              <p className="text-2xl mb-0.5">{rank.icon}</p>
              <p className="font-bold text-lg">Day {currentUser.streak}</p>
              <p className="text-xs text-muted-foreground">current streak</p>
            </CardContent>
          </Card>
        )}
        <Card className="min-w-[150px] flex-shrink-0 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardContent className="p-3.5 text-center">
            <p className="text-2xl mb-0.5">&#x1F3C3;</p>
            <p className="font-bold text-lg">{availableRunners.length}</p>
            <p className="text-xs text-muted-foreground">runners nearby</p>
          </CardContent>
        </Card>
      </div>
      <Separator />
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9"><AvatarFallback className={`text-xs text-white ${getAvatarColor(currentUser?.name || 'U')}`}>{getInitials(currentUser?.name || 'U')}</AvatarFallback></Avatar>
        <button onClick={() => setPostDialogOpen(true)} className="flex-1 text-left text-sm text-muted-foreground bg-muted/50 rounded-full px-4 py-2.5 hover:bg-muted transition-colors">What&apos;s on your mind?</button>
      </div>
      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => (<Card key={i}><CardContent className="p-4 space-y-3"><div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div></div></CardContent></Card>))}</div>
      ) : (
        <div className="space-y-3">
          {posts?.map((post: any) => (
            <motion.div key={post.id} {...fadeUp}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 mt-0.5"><AvatarFallback className={`text-xs text-white ${getAvatarColor(post.author?.name || 'U')}`}>{getInitials(post.author?.name || 'U')}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{post.author?.name}</span>
                        {post.group?.name && <Badge variant="secondary" className="text-xs px-1.5 py-0">{post.group.name}</Badge>}
                        {post.postType === 'milestone' && <Badge className="text-xs px-1.5 py-0 bg-amber-500 text-white border-0">milestone</Badge>}
                        {post.postType === 'question' && <Badge className="text-xs px-1.5 py-0 bg-emerald-500 text-white border-0">question</Badge>}
                        <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="text-sm mt-1.5 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                      <div className="flex items-center gap-5 mt-3">
                        <button onClick={() => likeMutation.mutate(post.id)} className="flex items-center gap-1.5 text-muted-foreground hover:text-rose-500 transition-colors"><Heart className="h-4 w-4" /><span className="text-xs font-medium">{post.likes}</span></button>
                        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"><MessageCircle className="h-4 w-4" /><span className="text-xs font-medium">{post.comments}</span></button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl"><DialogHeader><DialogTitle>Share with your community</DialogTitle></DialogHeader>
        <Textarea value={newPostContent} onChange={e => setNewPostContent(e.target.value)} placeholder="What's on your mind?" rows={4} />
        <DialogFooter><Button variant="ghost" onClick={() => setPostDialogOpen(false)}>Cancel</Button><Button className="rounded-full" disabled={!newPostContent.trim()} onClick={() => postMutation.mutate(newPostContent)}>Post</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}