'use client'

import { motion } from 'framer-motion'
import { Rss, MapPin, Flame, Users, User } from 'lucide-react'
import { useRunsembleStore, type TabType } from '@/lib/store'

const tabs: { id: TabType; icon: typeof Rss; label: string }[] = [
  { id: 'feed', icon: Rss, label: 'Feed' },
  { id: 'map', icon: MapPin, label: 'Map' },
  { id: 'hotspots', icon: Flame, label: 'Runs' },
  { id: 'groups', icon: Users, label: 'Groups' },
  { id: 'profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const { activeTab, setActiveTab, unreadCount } = useRunsembleStore()

  const activeIndex = tabs.findIndex(t => t.id === activeTab)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50">
      <div className="max-w-md mx-auto relative">
        {/* Sliding active indicator bar */}
        <motion.div
          layoutId="nav-indicator"
          className="absolute top-0 h-0.5 rounded-full bg-primary"
          style={{
            width: `${100 / tabs.length}%`,
            left: `${activeIndex * (100 / tabs.length)}%`,
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />

        <div className="flex items-center justify-around h-16 safe-bottom">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.88 }}
                className="relative flex flex-col items-center gap-0.5 py-1 px-3 transition-colors"
              >
                <div className="relative">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.15 : 1,
                      y: isActive ? -2 : 0,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 25,
                    }}
                  >
                    <Icon
                      className={`h-5 w-5 transition-colors duration-200 ${
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />
                  </motion.div>
                  {/* Unread badge on Feed tab */}
                  {tab.id === 'feed' && unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full px-1 shadow-sm shadow-rose-500/30"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                  )}
                </div>
                <motion.span
                  animate={{
                    color: isActive ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                  }}
                  className={`text-[10px] font-medium transition-colors duration-200 ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {tab.label}
                </motion.span>
                {/* Active dot indicator */}
                {isActive && (
                  <motion.div
                    layoutId="active-dot"
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
              </motion.button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}