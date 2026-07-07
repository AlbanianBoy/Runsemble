'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, Flame, Users, ChevronRight, CalendarClock, ImagePlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRunsembleStore } from '@/lib/store'
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
import { getAvatarColor, getInitials, formatDuration } from './helpers'
import { parsePath, formatClock, formatPaceLabel } from '@/lib/run'
import { fileToCompressedDataUrl } from '@/lib/image'
import { isAvailableNow } from '@/lib/availability'
import { CommentsSheet } from './comments-sheet'

const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
}

export function FeedTab() {
  const queryClient = useQueryClient()
  const { currentUser, setActiveTab } = useRunsembleStore()
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostImage, setNewPostImage] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
  const availableRunners = users.filter((u) => isAvailableNow(u) && u.id !== currentUser?.id)

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
      apiSend('/api/feed', 'POST', {
        content,
        postType: 'moment',
        imageUrl: newPostImage ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKey })
      setPostDialogOpen(false)
      setNewPostContent('')
      setNewPostImage(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Downscale + compress the chosen photo in the browser before it ever
  // leaves the device.
  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setImageBusy(true)
    try {
      setNewPostImage(await fileToCompressedDataUrl(file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that image')
    }
    setImageBusy(false)
  }

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
              {active && <motion.span layoutId="feed-toggle" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className="relative z-10">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {/* Next run — one clear call to action instead of three competing cards */}
      {nextHotspot && (
        <motion.div {...fadeUp}>
          <Card
            className="border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setActiveTab('map')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Next run · in {formatDuration(nextHotspot.minutesUntil)}
                </p>
                <p className="font-semibold text-sm truncate">{nextHotspot.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {nextHotspot.participantCount} joining · {nextHotspot.location}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick stats — calm, static, glanceable */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              <Flame className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              {(currentUser?.streak ?? 0) > 0 ? (
                <>
                  <p className="font-bold text-base leading-none tabular">{currentUser?.streak} {currentUser?.streak === 1 ? 'day' : 'days'}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">current streak</p>
                </>
              ) : (
                <>
                  {/* A dead zero invites nobody — make the empty state a nudge. */}
                  <p className="font-bold text-base leading-none">Run today</p>
                  <p className="text-[11px] text-muted-foreground mt-1">start your streak</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-none tabular">{availableRunners.length}</p>
              <p className="text-[11px] text-muted-foreground mt-1">runners nearby</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
          Share a run or ask a question…
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
      ) : posts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {scope === 'following' ? (
              <>
                <p className="font-medium text-foreground mb-1">Your feed is quiet</p>
                <p>Run with people to add buddies — their posts and your groups show up here.</p>
                <Button variant="outline" size="sm" className="rounded-full mt-4" onClick={() => setScope('all')}>
                  Browse everyone
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground mb-1">No posts yet</p>
                <p>Track a run and share it to get things going.</p>
              </>
            )}
          </CardContent>
        </Card>
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
                        {/* Photo */}
                        {post.imageUrl && (
                          <img
                            src={post.imageUrl}
                            alt=""
                            loading="lazy"
                            className="mt-2.5 w-full max-h-80 object-cover rounded-xl border"
                          />
                        )}
                        {/* Route card for shared runs — the map IS the story */}
                        {post.runSession && (() => {
                          const pts = parsePath(post.runSession.path)
                          return (
                            <div className="mt-2.5">
                              {pts.length >= 2 && (
                                <div className="h-32 rounded-xl overflow-hidden border mb-2">
                                  <RouteMap points={pts} />
                                </div>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground tabular">
                                <span className="font-semibold text-foreground">
                                  {post.runSession.distanceKm.toFixed(2)} km
                                </span>
                                <span>{formatClock(post.runSession.durationSec)}</span>
                                <span>{formatPaceLabel(post.runSession.avgPaceSecPerKm)}</span>
                              </div>
                            </div>
                          )
                        })()}
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
            placeholder="Share a run, a milestone, or ask a question…"
            rows={4}
          />

          {/* Photo preview */}
          {newPostImage && (
            <div className="relative">
              <img src={newPostImage} alt="Photo to share" className="w-full max-h-56 object-cover rounded-xl border" />
              <button
                onClick={() => setNewPostImage(null)}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImage}
          />

          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageBusy}
              aria-label="Add a photo"
            >
              {imageBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPostDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="rounded-full"
                disabled={!newPostContent.trim() || imageBusy || postMutation.isPending}
                onClick={() => postMutation.mutate(newPostContent)}
              >
                Post
              </Button>
            </div>
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