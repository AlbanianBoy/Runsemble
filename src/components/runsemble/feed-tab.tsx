'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, Flame, Users, ChevronRight, CalendarClock, ImagePlus, X, Loader2, MoreHorizontal, Route, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { newClientId } from '@/lib/client-id'
import { useRunsembleStore } from '@/lib/store'
import { showMutationError } from '@/lib/mutation-error'
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
import { ReportSheet } from './report-sheet'
import { TrustBadge } from './trust-badge'

const RouteMap = dynamic(() => import('./route-map'), { ssr: false })

// Posts per page. Small enough that opening the feed is one quick request on
// mobile data, large enough to fill a screen without immediately asking again.
const FEED_PAGE_SIZE = 20

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
  const [reportPost, setReportPost] = useState<{ id: string; author: string } | null>(null)
  const [scope, setScope] = useState<'following' | 'all'>('all')

  const feedKey = ['feed', currentUser?.id, scope] as const

  // Paged, so opening the feed doesn't download every post ever written. Older
  // pages load on demand as you reach the bottom.
  const {
    data: feedData,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: feedKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      apiGet<FeedResponse>(
        `/api/feed?scope=${scope}&limit=${FEED_PAGE_SIZE}${pageParam ? `&cursor=${pageParam}` : ''}`
      ),
    getNextPageParam: (last) => last.nextCursor,
  })
  const { data: hotspotsData } = useQuery({
    queryKey: ['hotspots'],
    queryFn: () => apiGet<HotspotsResponse>('/api/hotspots'),
  })
  const { data: usersData } = useQuery({
    // Same viewer-scoped discovery the map uses — this list only powers the
    // "available near you" strip, so it has no business fetching the whole city.
    queryKey: ['users', currentUser?.id, currentUser?.lat, currentUser?.lng],
    queryFn: () => {
      const { lat, lng } = currentUser ?? {}
      const scope = lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ''
      return apiGet<UsersResponse>(`/api/users?viewerId=${currentUser?.id ?? ''}${scope}`)
    },
  })

  // Pull the next page in slightly before the sentinel is actually on screen, so
  // scrolling doesn't stop at a spinner. Falls back to tapping the button if the
  // browser has no IntersectionObserver.
  const loadMoreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '400px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const posts: ApiFeedPost[] = feedData?.pages.flatMap((p) => p.posts) ?? []
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
      // The post lives in whichever page happened to contain it, so every page
      // gets the same map rather than just the first.
      queryClient.setQueryData<InfiniteData<FeedResponse, string | null>>(feedKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                posts: page.posts.map((p) =>
                  p.id === postId
                    ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) }
                    : p
                ),
              })),
            }
          : old
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  })

  // One id per post being composed; a new one only after the last succeeded.
  // A retry of the same post therefore carries the same id and cannot produce a
  // duplicate — nor re-upload its photo. See lib/idempotency.ts.
  const draftPostId = useRef(newClientId())

  const postMutation = useMutation({
    mutationFn: (content: string) =>
      apiSend('/api/feed', 'POST', {
        content,
        postType: 'moment',
        imageUrl: newPostImage ?? undefined,
        clientId: draftPostId.current,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKey })
      setPostDialogOpen(false)
      setNewPostContent('')
      setNewPostImage(null)
      draftPostId.current = newClientId()
    },
    onError: (e: Error) => showMutationError(e),
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
                  <p className="font-bold text-base leading-none tabular">{currentUser?.streak} {currentUser?.streak === 1 ? 'run day' : 'run days'}</p>
                  {/* "run days", not "days": the streak survives one rest day,
                      so calling it a consecutive-day count would be a lie the
                      first time someone takes the rest day we want them to. */}
                  <p className="text-[11px] text-muted-foreground mt-1">one rest day won&apos;t break it</p>
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
      ) : isError ? (
        // M30 — show a real error state instead of silently falling through to
        // the empty-feed copy, which would imply the request succeeded with 0
        // posts. The user needs to know something went wrong and have a way out.
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-8 text-center space-y-3">
            <WifiOff className="h-8 w-8 mx-auto text-destructive/70" />
            <div>
              <p className="font-medium text-sm text-foreground">Couldn't load the feed</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'Something went wrong — please try again.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => refetch()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
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
            const isOwnPost = post.authorId === currentUser?.id
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
                        <div className="flex items-start gap-2">
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <span className="font-semibold text-sm">{post.author?.name}</span>
                            {/* Trust signal — only on strangers, never on your own posts */}
                            {!isOwnPost && post.author && (
                              <TrustBadge
                                totalRuns={post.author.totalRuns ?? 0}
                                totalPeopleRunWith={post.author.totalPeopleRunWith ?? 0}
                                isSelf={false}
                              />
                            )}
                            {post.group?.name && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
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
                            <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
                          </div>
                          {/* Report — only on other people's posts. You don't report yourself. */}
                          {!isOwnPost && (
                            <button
                              onClick={() => setReportPost({ id: post.id, author: post.author?.name ?? 'this post' })}
                              aria-label="Report post"
                              className="shrink-0 -mr-1 -mt-0.5 p-1 rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
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
                        {/* Route card for shared runs — the map IS the story, so it
                            leads: a tall map with the stats sat on top of it. */}
                        {post.runSession && (() => {
                          const rs = post.runSession
                          const pts = parsePath(rs.path)
                          return (
                            <div className="mt-2.5 rounded-2xl overflow-hidden border bg-muted/30">
                              {pts.length >= 2 ? (
                                <div className="relative h-52">
                                  <RouteMap points={pts} />
                                  {/* Distance overlaid, bottom-left, over a soft scrim so it reads on any map tile. */}
                                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/55 to-transparent pointer-events-none">
                                    <p className="text-2xl font-extrabold tabular text-white leading-none drop-shadow-sm">
                                      {rs.distanceKm.toFixed(2)}
                                      <span className="text-sm font-semibold ml-1">km</span>
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 px-3.5 pt-3 text-sm font-bold text-foreground">
                                  <Route className="h-4 w-4 text-primary" />
                                  <span className="tabular">{rs.distanceKm.toFixed(2)} km</span>
                                </div>
                              )}
                              <div className="flex items-center divide-x divide-border/70 px-1 py-2 text-center">
                                <Stat label="Time" value={formatClock(rs.durationSec)} />
                                <Stat label="Pace" value={formatPaceLabel(rs.avgPaceSecPerKm)} />
                                {pts.length < 2 && <Stat label="Distance" value={`${rs.distanceKm.toFixed(2)} km`} />}
                              </div>
                            </div>
                          )
                        })()}
                        <div className="flex items-center gap-6 mt-3">
                          {/* Like button with toggle state */}
                          <motion.button
                            onClick={() => handleLike(post.id)}
                            whileTap={{ scale: 0.85 }}
                            aria-pressed={isLiked}
                            aria-label={post.likes > 0 ? `${post.likes} likes` : 'Like'}
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
                            {/* A zero is worse than nothing here. At cold start
                                every post reads "0 likes, 0 comments", which
                                is a row of evidence that nobody engages —
                                exactly the wrong first impression for a feed
                                that's new rather than dead. The icon alone is
                                still a working button; the number appears the
                                moment there's a number worth showing. */}
                            {post.likes > 0 && (
                              <span className="text-xs font-medium tabular">
                                {post.likes}
                              </span>
                            )}
                          </motion.button>
                          {/* Comment button */}
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setCommentsPostId(post.id)}
                            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors duration-200"
                            aria-label={post.comments > 0 ? `${post.comments} comments` : 'Add a comment'}
                          >
                            <MessageCircle className="h-4 w-4" />
                            {post.comments > 0 && (
                              <span className="text-xs font-medium tabular">{post.comments}</span>
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}

          {/* Older posts load when this scrolls into view; the button is the
              fallback for anyone whose browser has no IntersectionObserver, and
              a plain target for taps. */}
          {hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading older posts
                  </>
                ) : (
                  'Load older posts'
                )}
              </Button>
            </div>
          )}
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

      {/* Report a post */}
      <ReportSheet
        open={!!reportPost}
        onOpenChange={(open) => { if (!open) setReportPost(null) }}
        subjectType="post"
        subjectId={reportPost?.id ?? null}
        subjectLabel={reportPost ? `${reportPost.author}'s post` : undefined}
      />
    </div>
  )
}

/** One labelled stat in a route card's footer. Tabular so columns line up. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-2">
      <p className="text-sm font-bold tabular leading-tight">{value}</p>
      <p className="rs-label-caps text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
