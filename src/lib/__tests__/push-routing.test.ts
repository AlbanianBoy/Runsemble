import { describe, it, expect } from 'vitest'
import { tabForPush, isDmPush, queryKeysForPush } from '@/lib/push-routing'

describe('tabForPush', () => {
  // Every tap used to land on Groups, because sendPush labelled every push
  // 'message' and the handler navigated unconditionally. Tapping "you earned a
  // badge" took you to your conversations.
  it.each([
    ['group_message', 'groups'],
    ['like', 'feed'],
    ['comment', 'feed'],
    ['badge', 'profile'],
    ['rank_up', 'profile'],
    ['run_complete', 'profile'],
    ['hotspot_join', 'hotspots'],
    ['hotspot_reminder', 'hotspots'],
    ['run_invite', 'groups'],
    // Group events used to masquerade as hotspot_join and open the Hotspots tab.
    ['group_chat', 'groups'],
    ['group_added', 'groups'],
    ['group_role', 'groups'],
    ['group_run_started', 'groups'],
  ])('%s opens the %s tab', (type, tab) => {
    expect(tabForPush(type)).toBe(tab)
  })

  it('routes a group run-start to Groups, not Hotspots (the overloaded-type bug)', () => {
    expect(tabForPush('group_run_started')).toBe('groups')
  })

  it('falls back to groups for a type it has never heard of', () => {
    expect(tabForPush('something_new')).toBe('groups')
    expect(tabForPush(undefined)).toBe('groups')
  })

  it('sends a like to the feed, not to conversations', () => {
    // The specific regression, stated plainly.
    expect(tabForPush('like')).not.toBe('groups')
  })
})

describe('isDmPush', () => {
  it('is true for a DM carrying both sender fields', () => {
    expect(isDmPush({ type: 'group_message', senderId: 'u2', senderName: 'Maya' })).toBe(true)
  })

  it('is false without a name — the sheet has nothing to render', () => {
    expect(isDmPush({ type: 'group_message', senderId: 'u2' })).toBe(false)
  })

  it('is false without an id — there is no one to open', () => {
    expect(isDmPush({ type: 'group_message', senderName: 'Maya' })).toBe(false)
  })

  it('is false for a like that happens to carry a sender', () => {
    expect(isDmPush({ type: 'like', senderId: 'u2', senderName: 'Maya' })).toBe(false)
  })
})

describe('queryKeysForPush', () => {
  it('always refreshes notifications — every push writes one', () => {
    for (const t of ['like', 'badge', 'group_message', 'nonsense', undefined]) {
      expect(queryKeysForPush(t)).toContain('notifications')
    }
  })

  it('refreshes the conversation list and the open thread for a DM', () => {
    const keys = queryKeysForPush('group_message')
    expect(keys).toContain('conversations')
    expect(keys).toContain('dm')
  })

  it('refreshes the feed for a like or a comment', () => {
    expect(queryKeysForPush('like')).toContain('feed')
    expect(queryKeysForPush('comment')).toContain('feed')
  })

  it('does not refresh the feed for a DM — nothing about the feed changed', () => {
    expect(queryKeysForPush('group_message')).not.toContain('feed')
  })

  it('refreshes badges when one is earned', () => {
    expect(queryKeysForPush('badge')).toContain('badges')
  })

  it('refreshes the leaderboard on a rank up', () => {
    expect(queryKeysForPush('rank_up')).toContain('leaderboard')
  })

  it('returns only notifications for an unknown type, rather than refetching everything', () => {
    expect(queryKeysForPush('something_new')).toEqual(['notifications'])
  })
})
