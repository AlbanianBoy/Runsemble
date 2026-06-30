const AVATAR_COLORS = [
  'bg-orange-500', 'bg-amber-600', 'bg-emerald-600', 'bg-rose-500',
  'bg-violet-500', 'bg-teal-500', 'bg-pink-500', 'bg-yellow-600',
  'bg-red-500', 'bg-cyan-600',
]

export function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}