import { db } from './src/lib/db'

async function seed() {
  console.log('Seeding database...')

  // Clean up
  await db.userBadge.deleteMany()
  await db.runRating.deleteMany()
  await db.groupChatMessage.deleteMany()
  await db.chatMessage.deleteMany()
  await db.feedPost.deleteMany()
  await db.groupMember.deleteMany()
  await db.hotspotParticipant.deleteMany()
  await db.runGroup.deleteMany()
  await db.hotspot.deleteMany()
  await db.user.deleteMany()

  // Create users
  const users = await Promise.all([
    db.user.create({
      data: {
        name: 'Maya Chen',
        email: 'maya@runsemble.app',
        avatar: null,
        bio: 'Just moved to Antwerp for my master\'s. Looking for running buddies!',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'evening',
        xp: 420,
        streak: 5,
        longestStreak: 12,
        totalRuns: 28,
        totalPeopleRunWith: 14,
        isAvailable: true,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Jonas De Smedt',
        email: 'jonas@runsemble.app',
        avatar: null,
        bio: 'Getting back into shape. Slow and steady wins the race.',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'beginner',
        schedulePreference: 'evening',
        xp: 180,
        streak: 3,
        longestStreak: 7,
        totalRuns: 12,
        totalPeopleRunWith: 6,
        isAvailable: true,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Sophie Van den Berg',
        email: 'sophie@runsemble.app',
        avatar: null,
        bio: 'Marathon runner, trail lover. Always up for a group run!',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'advanced',
        schedulePreference: 'morning',
        xp: 1250,
        streak: 15,
        longestStreak: 45,
        totalRuns: 142,
        totalPeopleRunWith: 38,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Lars Wouters',
        email: 'lars@runsemble.app',
        avatar: null,
        bio: 'Weekend warrior. Monday to Friday I sit, Saturday I sprint.',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'morning',
        xp: 680,
        streak: 8,
        longestStreak: 21,
        totalRuns: 67,
        totalPeopleRunWith: 22,
        isAvailable: true,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Emma Peeters',
        email: 'emma@runsemble.app',
        avatar: null,
        bio: 'New to running but loving the community here!',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'beginner',
        schedulePreference: 'afternoon',
        xp: 90,
        streak: 2,
        longestStreak: 4,
        totalRuns: 6,
        totalPeopleRunWith: 3,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Kai Nakamura',
        email: 'kai@runsemble.app',
        avatar: null,
        bio: 'Exchange student from Tokyo. Running helps me explore the city.',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'evening',
        xp: 310,
        streak: 4,
        longestStreak: 9,
        totalRuns: 19,
        totalPeopleRunWith: 11,
        isAvailable: true,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Anja Thijs',
        email: 'anja@runsemble.app',
        avatar: null,
        bio: 'Parkrun addict. See you every Saturday at 9am!',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'advanced',
        schedulePreference: 'morning',
        xp: 890,
        streak: 22,
        longestStreak: 52,
        totalRuns: 98,
        totalPeopleRunWith: 45,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
    db.user.create({
      data: {
        name: 'Tomas Vermeulen',
        email: 'tomas@runsemble.app',
        avatar: null,
        bio: 'Running to clear my head. Also for the post-run coffee.',
        city: 'Antwerp',
        preferredSport: 'running',
        paceLevel: 'beginner',
        schedulePreference: 'evening',
        xp: 150,
        streak: 1,
        longestStreak: 5,
        totalRuns: 9,
        totalPeopleRunWith: 4,
        isAvailable: true,
        privacyVisible: true,
        onboardingComplete: true,
      },
    }),
  ])

  // Create hotspots (upcoming runs)
  const now = new Date()
  const hotspots = await Promise.all([
    db.hotspot.create({
      data: {
        name: 'Stadspark Evening Run',
        description: 'A relaxing 5k through the beautiful Stadspark. All paces welcome!',
        location: 'Stadspark, Antwerp',
        lat: 51.2093,
        lng: 4.4256,
        sportType: 'running',
        distanceKm: 5.0,
        paceRange: 'any',
        startTime: new Date(now.getTime() + 18 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[0].id,
      },
    }),
    db.hotspot.create({
      data: {
        name: 'Scheldt River Run',
        description: 'Run along the Scheldt at sunset. Beautiful views guaranteed.',
        location: 'Scheldt Quay, Antwerp',
        lat: 51.2206,
        lng: 4.4168,
        sportType: 'running',
        distanceKm: 7.5,
        paceRange: 'intermediate',
        startTime: new Date(now.getTime() + 48 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[2].id,
      },
    }),
    db.hotspot.create({
      data: {
        name: 'Berchem Morning Sprint',
        description: 'Quick morning run to start the day right. Coffee afterwards!',
        location: 'Berchem Station, Antwerp',
        lat: 51.1994,
        lng: 4.4325,
        sportType: 'running',
        distanceKm: 3.0,
        paceRange: 'any',
        startTime: new Date(now.getTime() + 78 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[3].id,
      },
    }),
    db.hotspot.create({
      data: {
        name: 'Zuid Park Loop',
        description: 'Easy loop through Zuidpark. Great for beginners!',
        location: 'Zuidpark, Antwerp',
        lat: 51.2020,
        lng: 4.3450,
        sportType: 'running',
        distanceKm: 4.0,
        paceRange: 'beginner',
        startTime: new Date(now.getTime() + 108 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[1].id,
      },
    }),
    db.hotspot.create({
      data: {
        name: 'Central Station Night Run',
        description: 'Explore the city center by night. Well-lit paths, safe route.',
        location: 'Central Station, Antwerp',
        lat: 51.2176,
        lng: 4.4213,
        sportType: 'running',
        distanceKm: 6.0,
        paceRange: 'intermediate',
        startTime: new Date(now.getTime() + 138 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[5].id,
      },
    }),
    db.hotspot.create({
      data: {
        name: 'Bourla Theatre Quick Run',
        description: 'Short but sweet. 30-minute run around the historic center.',
        location: 'Bourla Theatre, Antwerp',
        lat: 51.2180,
        lng: 4.4030,
        sportType: 'running',
        distanceKm: 3.5,
        paceRange: 'any',
        startTime: new Date(now.getTime() + 168 * 60000),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: users[6].id,
      },
    }),
  ])

  // Add participants to hotspots
  await Promise.all([
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[0].id, userId: users[0].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[0].id, userId: users[1].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[0].id, userId: users[5].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[0].id, userId: users[7].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[1].id, userId: users[2].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[1].id, userId: users[3].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[1].id, userId: users[6].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[2].id, userId: users[3].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[2].id, userId: users[4].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[3].id, userId: users[1].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[3].id, userId: users[4].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[3].id, userId: users[7].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[4].id, userId: users[5].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[4].id, userId: users[0].id, status: 'joined' } }),
    db.hotspotParticipant.create({ data: { hotspotId: hotspots[5].id, userId: users[6].id, status: 'joined' } }),
  ])

  // Create groups
  const groups = await Promise.all([
    db.runGroup.create({
      data: {
        name: 'Antwerp Morning Runners',
        description: 'Early birds who love the sunrise and the endorphins. We meet every morning at 6:30am near Stadspark.',
        isPublic: true,
        city: 'Antwerp',
        totalKmThisWeek: 47.5,
        memberCount: 24,
        createdBy: users[2].id,
      },
    }),
    db.runGroup.create({
      data: {
        name: 'UAntwerp Student Run Club',
        description: 'Running club for University of Antwerp students. All levels welcome - we run for fun, not medals!',
        isPublic: true,
        city: 'Antwerp',
        totalKmThisWeek: 32.0,
        memberCount: 18,
        createdBy: users[0].id,
      },
    }),
    db.runGroup.create({
      data: {
        name: 'Weekend Trail Crew',
        description: 'Saturday and Sunday trail runs in and around Antwerp. Nature lovers unite!',
        isPublic: true,
        city: 'Antwerp',
        totalKmThisWeek: 68.0,
        memberCount: 31,
        createdBy: users[3].id,
      },
    }),
    db.runGroup.create({
      data: {
        name: 'Maya & Friends',
        description: 'Our little running crew. Invite only!',
        isPublic: false,
        city: 'Antwerp',
        totalKmThisWeek: 15.5,
        memberCount: 5,
        createdBy: users[0].id,
      },
    }),
  ])

  // Add group members
  await Promise.all([
    db.groupMember.create({ data: { groupId: groups[0].id, userId: users[2].id, role: 'owner' } }),
    db.groupMember.create({ data: { groupId: groups[0].id, userId: users[3].id, role: 'admin' } }),
    db.groupMember.create({ data: { groupId: groups[0].id, userId: users[6].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[0].id, userId: users[0].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[1].id, userId: users[0].id, role: 'owner' } }),
    db.groupMember.create({ data: { groupId: groups[1].id, userId: users[1].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[1].id, userId: users[4].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[1].id, userId: users[5].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[2].id, userId: users[3].id, role: 'owner' } }),
    db.groupMember.create({ data: { groupId: groups[2].id, userId: users[2].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[2].id, userId: users[6].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[3].id, userId: users[0].id, role: 'owner' } }),
    db.groupMember.create({ data: { groupId: groups[3].id, userId: users[1].id, role: 'member' } }),
    db.groupMember.create({ data: { groupId: groups[3].id, userId: users[5].id, role: 'member' } }),
  ])

  // Create feed posts
  const posts = await Promise.all([
    db.feedPost.create({
      data: {
        authorId: users[0].id,
        groupId: groups[1].id,
        content: 'First 5k without stopping! I can\'t believe it. Two weeks ago I couldn\'t even run 1k. This community is everything.',
        postType: 'milestone',
        likes: 24,
        comments: 8,
        createdAt: new Date(now.getTime() - 2 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[2].id,
        groupId: groups[0].id,
        content: 'Rain or shine, the morning crew showed up today. 7 of us ran 8k along the Scheldt. The sunrise was absolutely worth the early alarm.',
        postType: 'moment',
        likes: 31,
        comments: 5,
        createdAt: new Date(now.getTime() - 5 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[3].id,
        groupId: groups[2].id,
        content: 'Who\'s joining the trail run this Saturday? Thinking Rivierenhof park - it has some great off-road sections!',
        postType: 'question',
        likes: 12,
        comments: 15,
        createdAt: new Date(now.getTime() - 8 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[1].id,
        groupId: groups[1].id,
        content: 'Week 3 complete! My stamina is improving so much. Thanks to everyone who paced with me today - you made the difference.',
        postType: 'moment',
        likes: 18,
        comments: 6,
        createdAt: new Date(now.getTime() - 12 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[5].id,
        groupId: groups[1].id,
        content: 'Moved from Tokyo 3 months ago. Running with this group has been the best way to explore Antwerp and make friends. Grateful for this app!',
        postType: 'moment',
        likes: 42,
        comments: 11,
        createdAt: new Date(now.getTime() - 24 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[4].id,
        content: 'Just joined my first hotspot run and it was amazing! Met 3 new people and we\'re already planning to run together next week. If you\'re on the fence about joining one - do it!',
        postType: 'moment',
        likes: 35,
        comments: 9,
        createdAt: new Date(now.getTime() - 30 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[6].id,
        groupId: groups[0].id,
        content: 'Streak 22! But honestly, it\'s not about the number. It\'s about the people I get to see every morning. You all make showing up easy.',
        postType: 'milestone',
        likes: 56,
        comments: 14,
        createdAt: new Date(now.getTime() - 36 * 3600000),
      },
    }),
    db.feedPost.create({
      data: {
        authorId: users[7].id,
        content: 'Who\'s joining the hotspot at Berchem tonight? First time and feeling a bit nervous but excited!',
        postType: 'question',
        likes: 8,
        comments: 12,
        createdAt: new Date(now.getTime() - 1 * 3600000),
      },
    }),
  ])

  // Create badges
  await Promise.all([
    db.userBadge.create({ data: { userId: users[0].id, badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: '🏃' } }),
    db.userBadge.create({ data: { userId: users[0].id, badgeType: 'streak_3', title: 'Getting Started', description: '3-day running streak', icon: '🌱' } }),
    db.userBadge.create({ data: { userId: users[0].id, badgeType: 'streak_5', title: 'On Fire', description: '5-day running streak', icon: '🔥' } }),
    db.userBadge.create({ data: { userId: users[0].id, badgeType: 'social_butterfly', title: 'Social Butterfly', description: 'Ran with 10+ different people', icon: '🦋' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: '🏃' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: '⚡' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'streak_30', title: 'Unstoppable', description: '30-day running streak', icon: '🏆' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'social_butterfly', title: 'Social Butterfly', description: 'Ran with 10+ different people', icon: '🦋' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'early_bird', title: 'Early Bird', description: 'Joined 10 morning runs', icon: '🌅' } }),
    db.userBadge.create({ data: { userId: users[2].id, badgeType: 'community_leader', title: 'Community Leader', description: 'Created a group with 20+ members', icon: '👑' } }),
    db.userBadge.create({ data: { userId: users[6].id, badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: '🏃' } }),
    db.userBadge.create({ data: { userId: users[6].id, badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: '⚡' } }),
    db.userBadge.create({ data: { userId: users[6].id, badgeType: 'streak_21', title: 'Habit Former', description: '21-day running streak', icon: '💪' } }),
    db.userBadge.create({ data: { userId: users[1].id, badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: '🏃' } }),
    db.userBadge.create({ data: { userId: users[1].id, badgeType: 'streak_3', title: 'Getting Started', description: '3-day running streak', icon: '🌱' } }),
    db.userBadge.create({ data: { userId: users[3].id, badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: '🏃' } }),
    db.userBadge.create({ data: { userId: users[3].id, badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: '⚡' } }),
    db.userBadge.create({ data: { userId: users[3].id, badgeType: 'social_butterfly', title: 'Social Butterfly', description: 'Ran with 10+ different people', icon: '🦋' } }),
  ])

  // Create group chat messages
  await Promise.all([
    db.groupChatMessage.create({ data: { groupId: groups[0].id, senderId: users[2].id, content: 'See you all tomorrow at 6:30! Weather looks great.', createdAt: new Date(now.getTime() - 4 * 3600000) } }),
    db.groupChatMessage.create({ data: { groupId: groups[0].id, senderId: users[3].id, content: 'Can\'t wait! I\'ll bring the coffee.', createdAt: new Date(now.getTime() - 3.5 * 3600000) } }),
    db.groupChatMessage.create({ data: { groupId: groups[0].id, senderId: users[6].id, content: 'I\'ll be 5 min late, but I\'m coming!', createdAt: new Date(now.getTime() - 3 * 3600000) } }),
    db.groupChatMessage.create({ data: { groupId: groups[1].id, senderId: users[0].id, content: 'Great run today everyone! Who\'s up for Thursday evening?', createdAt: new Date(now.getTime() - 2.5 * 3600000) } }),
    db.groupChatMessage.create({ data: { groupId: groups[1].id, senderId: users[5].id, content: 'Count me in! Same route?', createdAt: new Date(now.getTime() - 2 * 3600000) } }),
    db.groupChatMessage.create({ data: { groupId: groups[1].id, senderId: users[4].id, content: 'I\'d love to! Can we do a slightly shorter one this time?', createdAt: new Date(now.getTime() - 1.5 * 3600000) } }),
  ])

  console.log('Seed complete!')
  console.log(`Created ${users.length} users`)
  console.log(`Created ${hotspots.length} hotspots`)
  console.log(`Created ${groups.length} groups`)
  console.log(`Created ${posts.length} feed posts`)
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })