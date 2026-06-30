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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50">
      <div className="max-w-md mx-auto flex items-center justify-around h-16 safe-bottom">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative flex flex-col items-center gap-0.5 py-1 px-3 transition-colors"
            >
              <div className="relative">
                <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {tab.id === 'feed' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{tab.label}</span>
              {isActive && (
                <motion.div layoutId="tab-indicator" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}