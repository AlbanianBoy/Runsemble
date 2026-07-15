'use client'

import { motion } from 'framer-motion'
import { Rss, MapPin, Users, User, Play, MessageSquare } from 'lucide-react'
import { useRunsembleStore, type TabType } from '@/lib/store'

const tabs: { id: TabType; icon: typeof Rss; label: string }[] = [
  { id: 'feed', icon: Rss, label: 'Feed' },
  { id: 'map', icon: MapPin, label: 'Explore' },
  { id: 'messages', icon: MessageSquare, label: 'Messages' },
  { id: 'groups', icon: Users, label: 'Groups' },
  { id: 'profile', icon: User, label: 'Profile' },
]

export function BottomNav() {
  const { activeTab, setActiveTab, openRunTracker, unreadDmCount } = useRunsembleStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t">
      <div className="max-w-md mx-auto relative">
        <div className="flex items-center justify-around h-16 safe-bottom px-2">
          {/* Left pair */}
          {tabs.slice(0, 2).map((tab) => (
            <NavButton key={tab.id} tab={tab} active={activeTab === tab.id} badge={0} onClick={() => setActiveTab(tab.id)} />
          ))}

          {/* Center raised Start button */}
          <div className="relative flex-1 self-stretch flex flex-col items-center justify-end pb-1.5">
            <motion.button
              onClick={() => openRunTracker({ label: 'Solo run' })}
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              className="absolute -top-6 h-14 w-14 rounded-full gradient-brand text-white shadow-lg shadow-teal-500/40 flex items-center justify-center ring-4 ring-background"
              aria-label="Start a run"
            >
              <Play className="h-6 w-6" fill="currentColor" />
            </motion.button>
            <span className="text-[10px] font-semibold text-primary">Start</span>
          </div>

          {/* Right pair */}
          {tabs.slice(2).map((tab) => (
            <NavButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              badge={tab.id === 'messages' ? unreadDmCount : 0}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}

function NavButton({
  tab,
  active,
  badge,
  onClick,
}: {
  tab: { id: TabType; icon: typeof Rss; label: string }
  active: boolean
  badge: number
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      className="relative flex flex-col items-center gap-0.5 py-1 px-3 flex-1"
    >
      <motion.div
        animate={{ scale: active ? 1.12 : 1, y: active ? -1 : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="relative"
      >
        <Icon className={`h-5 w-5 transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </motion.div>
      <span className={`text-[10px] font-medium transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}>
        {tab.label}
      </span>
      {active && (
        <motion.div layoutId="nav-dot" className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 400, damping: 28 }} />
      )}
    </motion.button>
  )
}
