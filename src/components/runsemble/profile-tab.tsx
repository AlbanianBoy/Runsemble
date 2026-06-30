'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Trophy, Users, Flame } from 'lucide-react'
import { useRunsembleStore, getRankFromXP } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { getAvatarColor, getInitials } from './helpers'

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } }

export function ProfileTab() {
  const { currentUser } = useRunsembleStore()

  const { data: badgesData, isLoading: badgesLoading } = useQuery({
    queryKey: ['badges', currentUser?.id],
    queryFn: () => fetch(`/api/badges?userId=${currentUser?.id}`).then(r => r.json()),
    enabled: !!currentUser?.id,
  })

  const badges = (badgesData as any)?.badges || []

  if (!currentUser) return <Skeleton className="h-64 w-full rounded-xl" />

  const rank = getRankFromXP(currentUser.xp)
  const xpProgress = rank.nextTierXP > 9999 ? 100 : ((currentUser.xp - rank.minXP) / (rank.nextTierXP - rank.minXP)) * 100

  return (
    <div className="space-y-5 pb-4">
      {/* Profile header */}
      <div className="text-center">
        <motion.div {...fadeUp} className="relative inline-block">
          <Avatar className="h-20 w-20 mx-auto ring-4 ring-primary/20">
            <AvatarFallback className={`text-xl text-white ${getAvatarColor(currentUser.name)}`}>{getInitials(currentUser.name)}</AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 text-2xl">{rank.icon}</div>
        </motion.div>
        <motion.h2 className="text-xl font-bold mt-3" {...fadeUp}>{currentUser.name}</motion.h2>
        {currentUser.bio && <p className="text-sm text-muted-foreground mt-1">{currentUser.bio}</p>}
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="secondary" className="text-xs">{currentUser.city}</Badge>
          <Badge variant="secondary" className="text-xs capitalize">{currentUser.paceLevel}</Badge>
          <Badge variant="secondary" className="text-xs capitalize">{currentUser.schedulePreference}</Badge>
        </div>
      </div>

      {/* Stats row */}
      <motion.div {...fadeUp} className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <div className="flex justify-center text-primary mb-1"><Trophy className="h-5 w-5" /></div>
          <p className="font-bold text-lg">{currentUser.totalRuns}</p>
          <p className="text-[10px] text-muted-foreground">Total Runs</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="flex justify-center text-primary mb-1"><Users className="h-5 w-5" /></div>
          <p className="font-bold text-lg">{currentUser.totalPeopleRunWith}</p>
          <p className="text-[10px] text-muted-foreground">Run Buddies</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="flex justify-center text-primary mb-1"><Flame className="h-5 w-5" /></div>
          <p className="font-bold text-lg">{currentUser.longestStreak}</p>
          <p className="text-[10px] text-muted-foreground">Best Streak</p>
        </CardContent></Card>
      </motion.div>

      {/* XP Progress */}
      <motion.div {...fadeUp}>
        <Card className="overflow-hidden">
          <div className="gradient-brand-subtle p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{rank.icon}</span>
                <div>
                  <p className="font-bold text-sm">{rank.tier}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.xp} XP</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {rank.nextTierXP > 9999 ? 'Max rank reached' : `Next: ${rank.nextTierXP} XP`}
              </p>
            </div>
            <Progress value={Math.min(xpProgress, 100)} className="h-2" />
          </div>
        </Card>
      </motion.div>

      {/* Streak */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xl font-bold shrink-0">
                {currentUser.streak}
              </div>
              <div>
                <p className="font-bold">Day {currentUser.streak} Streak</p>
                <p className="text-xs text-muted-foreground">Keep it going! Best: {currentUser.longestStreak} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Badges */}
      <motion.div {...fadeUp}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Badges</h3>
          <span className="text-xs text-muted-foreground">{badges?.length || 0} earned</span>
        </div>
        {badgesLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3,4,5,6].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : badges && badges.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {badges.map((b: any) => (
              <Card key={b.id} className="text-center p-2">
                <CardContent className="p-0">
                  <p className="text-2xl mb-1">{b.icon}</p>
                  <p className="text-[10px] font-semibold leading-tight">{b.title}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No badges yet. Join your first run to earn one!
            </CardContent>
          </Card>
        )}
      </motion.div>
    </div>
  )
}
