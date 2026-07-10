import { db } from './db'

// A feed post is visible to a viewer when it's a personal post, a post in a
// public group, or a post in a group the viewer belongs to. This mirrors the
// list-feed visibility filter for the single-post routes (comments, likes) so a
// private group's posts — and their comment threads — stay members-only.
export async function canViewPost(groupId: string | null, userId: string | null): Promise<boolean> {
  if (!groupId) return true
  const group = await db.runGroup.findUnique({ where: { id: groupId }, select: { isPublic: true } })
  if (!group || group.isPublic) return true
  if (!userId) return false
  const member = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  })
  return !!member
}
