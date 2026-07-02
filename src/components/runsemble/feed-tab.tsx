'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle } from 'lucide-react'
import { useRunsembleStore, getRankFromXP } from '@/lib/store'
import { apiGet, apiSend } from '@/lib/api'
import type {
  ApiFeedPost,
  ApiHotspot,
  ApiUser,
  FeedResponse,
  HotspotsResponse,
  UsersResponse,
} from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { getAvatarColor, getInitials } from './helpers'
import { CommentsSheet } from './comments-sheet'

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

export function FeedTab() {
  const queryClient = useQueryClient()
  const { currentUser } = useRunsembleStore()
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [newPostContent, setNewPostContent] = useState('')
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null)
  const [scope, setScope] = useState<'following' | 'all'>('all')

  const feedKey = ['feed', currentUser?.id, scope] as const

  const { data: feedData, isLoading } = useQuery({
    queryKey: feedKey,
    queryFn: () => apiGet<FeedResponse>(`/api/feed?userId=${currentUser?.id ?? ''}&scope=${scope}`),
  })
  const { data: hotspotsData } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  const { data: usersData } = useQuery({
    queryKey: ['users', currentUser?.id],
    queryFn: () => apiGet<UsersResponse>(`/api/users?viewerId=${currentUser?.id ?? ''}`),
  })

  const posts: ApiFeedPost[] = feedData?.posts ?? []
  const hotspots: ApiHotspot[] = hotspotsData?.hotspots ?? []
  const users: ApiUser[] = usersData?.users ?? []

  const nextHotspot = hotspots.find((h) => h.minutesUntil > 0)
  const availableRunners = users.filter((u) => u.isAvailable && u.id !== currentUser?.id)
  const rank = currentUser ? getRankFromXP(currentUser.xp) : null

  // Optimistically flip like state so the heart responds instantly; the server
  // is the source of truth and reconciles on invalidation.
  const likeMutation = useMutation({
    mutationFn: (postId: string) =>
      apiSend(`/api/feed/${postId}/like`, 'POST', { userId: currentUser?.id }),
    onMutate: (postId: string) => {
      queryClient.setQueryData<FeedResponse>(feedKey, (old) =>
        old
          ? {
              posts: old.posts.map((p) =>
                p.id === postId
                  ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) }
                  : p
              ),
            }
          : old
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  })

  const postMutation = useMutation({
    mutationFn: (content: string) =>
      apiSend('/api/feed', 'POST', { authorId: currentUser?.id, content, postType: 'moment' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKey })
      setPostDialogOpen(false)
      setNewPostContent('')
    },
  })

  function handleLike(postId: string) {
    if (!currentUser?.id) return
    likeMutation.mutate(postId)
  }

  function timeAgo(dateStr: string) {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Feed scope toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-muted">
        {([
          { id: 'following', label: 'For you' },
          { id: 'all', label: 'Everyone' },
        ] as const).map((opt) => {
          const active = scope === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => setScope(opt.id)}
              className={`relative rounded-full py-1.5 text-sm font-medium transition-colors ${active ? 'text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {active && <motion.span layoutId="feed-toggle" className="absolute inset-0 rounded-full gradient-brand" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative z-10">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {/* Stats strip with better shadows and spacing */}
      <motion.div
        className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: 'none' }}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {nextHotspot && (
          <motion.div variants={fadeUp}>
            <Card className="min-w-[250px] flex-shrink-0 border-0 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
              <CardContent className="p-4 relative">
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-amber-400 to-orange-500 opacity-10" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                    </span>
                    <span className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
                      Next Run
                    </span>
                  </div>
                  <p className="font-semibold text-sm leading-tight mb-1.5">{nextHotspot.name}</p>
                  <p className="text-xs text-muted-foreground">
                    starts in {nextHotspot.minutesUntil} min &middot;{' '}
                    {nextHotspot.participantCount} joining
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
        {currentUser && rank && (
          <motion.div variants={fadeUp}>
            <Card className="min-w-[150px] flex-shrink-0 border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardContent className="p-4 text-center">
                <motion.p
                  className="text-2xl mb-0.5"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {rank.icon}
                </motion.p>
                <p className="font-bold text-lg leading-none">Day {currentUser.streak}</p>
                <p className="text-xs text-muted-foreground mt-1">current streak</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
        <motion.div variants={fadeUp}>
          <Card className="min-w-[150px] flex-shrink-0 border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-4 text-center">
              <motion.p
                className="text-2xl mb-0.5"
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                🏃
              </motion.p>
              <p className="font-bold text-lg leading-none">{availableRunners.length}</p>
              <p className="text-xs text-muted-foreground mt-1">runners nearby</p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <Separator />

      {/* Post composer */}
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Avatar className="h-9 w-9">
          <AvatarFallback
            className={`text-xs text-white ${getAvatarColor(currentUser?.name || 'U')}`}
          >
            {getInitials(currentUser?.name || 'U')}
          </AvatarFallback>
        </Avatar>
        <button
          onClick={() => setPostDialogOpen(true)}
          className="flex-1 text-left text-sm text-muted-foreground bg-muted/50 rounded-full px-4 py-2.5 hover:bg-muted transition-colors duration-200 active:scale-[0.98] transform"
        >
          What&apos;s on your mind?
        </button>
      </motion.div>

      {/* Feed posts */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <motion.div className="space-y-3" variants={staggerContainer} initial="initial" animate="animate">
          {posts.map((post) => {
            const isLiked = post.likedByMe ?? false
            return (
              <motion.div key={post.id} variants={fadeUp}>
                <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 mt-0.5">
                        <AvatarFallback
                          className={`text-xs text-white ${getAvatarColor(post.author?.name || 'U')}`}
                        >
                          {getInitials(post.author?.name || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{post.author?.name}</span>
                          {post.group?.name && (
                            <Badge
                              variant="secondary"
                              className="text-xs px-1.5 py-0"
                            >
                              {post.group.name}
                            </Badge>
                          )}
                          {post.postType === 'milestone' && (
                            <Badge className="text-xs px-1.5 py-0 bg-amber-500 text-white border-0">
                              milestone
                            </Badge>
                          )}
                          {post.postType === 'question' && (
                            <Badge className="text-xs px-1.5 py-0 bg-emerald-500 text-white border-0">
                              question
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(post.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm mt-1.5 leading-relaxed whitespace-pre-wrap">
                          {post.content}
                        </p>
                        <div className="flex items-center gap-6 mt-3">
                          {/* Like button with toggle state */}
                          <motion.button
                            onClick={() => handleLike(post.id)}
                            whileTap={{ scale: 0.85 }}
                            className={`flex items-center gap-1.5 transition-colors duration-200 ${
                              isLiked
                                ? 'text-rose-500'
                                : 'text-muted-foreground hover:text-rose-400'
                            }`}
                          >
                            <motion.div
                              animate={
                                isLiked
                                  ? { scale: [1, 1.3, 1], rotate: [0, -10, 0] }
                                  : { scale: 1 }
                              }
                              transition={{ duration: 0.35, ease: 'easeOut' }}
                            >
                              <Heart
                                className="h-4 w-4"
                                fill={isLiked ? 'currentColor' : 'none'}
                                strokeWidth={isLiked ? 0 : 2}
                              />
                            </motion.div>
                            <span className="text-xs font-medium tabular">
                              {post.likes}
                            </span>
                          </motion.button>
                          {/* Comment button */}
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setCommentsPostId(post.id)}
                            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors duration-200"
                          >
                            <MessageCircle className="h-4 w-4" />
                            <span className="text-xs font-medium tabular">{post.comments}</span>
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* New post dialog */}
      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Share with your community</DialogTitle>
          </DialogHeader>
          <Textarea
            value={newPostContent}
            onChange={e => setNewPostContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPostDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={!newPostContent.trim()}
              onClick={() => postMutation.mutate(newPostContent)}
            >
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments */}
      <CommentsSheet
        postId={commentsPostId}
        open={!!commentsPostId}
        onOpenChange={(open) => { if (!open) setCommentsPostId(null) }}
      />
    </div>
  )
}