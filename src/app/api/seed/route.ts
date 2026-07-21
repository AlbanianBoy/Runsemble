import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { addHours, subHours, subDays } from 'date-fns'

async function seed() {
  console.log('Seeding database...')

  // 1. Clear all existing data in FK-safe order
  await db.runRating.deleteMany()
  await db.hotspotParticipant.deleteMany()
  await db.userBadge.deleteMany()
  // ChatMessage covers both DMs and group chat, so one wipe clears both.
  await db.chatMessage.deleteMany()
  await db.runInvite.deleteMany()
  await db.feedPost.deleteMany()
  await db.groupMember.deleteMany()
  await db.runGroup.deleteMany()
  await db.hotspot.deleteMany()
  await db.user.deleteMany()

  console.log('Cleared all existing data')

  // 2. Create 8 realistic seed users
  const now = new Date()
  const users = await db.user.createMany({
    data: [
      {
        id: 'user-maya',
        name: 'Maya Chen',
        email: 'maya.chen@runsemble.app',
        avatar: null,
        bio: "Trail enthusiast & sunrise chaser. If the path has mud, I'm there \u{1F3C3}\u200D\u2640\uFE0F\u{1F33F}",
        city: 'Antwerp',
        lat: 51.2205,
        lng: 4.4108,
        preferredSport: 'running',
        paceLevel: 'advanced',
        schedulePreference: 'morning',
        xp: 1250,
        streak: 14,
        longestStreak: 30,
        lastActiveDate: now.toISOString().split('T')[0],
        totalRuns: 87,
        totalPeopleRunWith: 34,
        isAvailable: true,
        availableUntil: addHours(now, 2),
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-jonas',
        name: 'Jonas De Smedt',
        email: 'jonas.desmedt@runsemble.app',
        avatar: null,
        bio: 'Marathon runner turned social runner. Best pace: 4:15/km',
        city: 'Antwerp',
        lat: 51.2158,
        lng: 4.4205,
        preferredSport: 'running',
        paceLevel: 'advanced',
        schedulePreference: 'evening',
        xp: 980,
        streak: 7,
        longestStreak: 21,
        lastActiveDate: now.toISOString().split('T')[0],
        totalRuns: 62,
        totalPeopleRunWith: 19,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-sophie',
        name: 'Sophie Van den Berg',
        email: 'sophie.vdb@runsemble.app',
        avatar: null,
        bio: 'Just finished my first 10K! Looking for running buddies',
        city: 'Antwerp',
        lat: 51.2078,
        lng: 4.4255,
        preferredSport: 'running',
        paceLevel: 'beginner',
        schedulePreference: 'evening',
        xp: 220,
        streak: 5,
        longestStreak: 12,
        lastActiveDate: subDays(now, 1).toISOString().split('T')[0],
        totalRuns: 18,
        totalPeopleRunWith: 7,
        isAvailable: true,
        availableUntil: addHours(now, 1),
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-lars',
        name: 'Lars Peeters',
        email: 'lars.peeters@runsemble.app',
        avatar: null,
        bio: 'Weekend warrior. Parkrun PB chaser. Dad of two',
        city: 'Antwerp',
        lat: 51.2122,
        lng: 4.398,
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'morning',
        xp: 540,
        streak: 3,
        longestStreak: 14,
        lastActiveDate: now.toISOString().split('T')[0],
        totalRuns: 41,
        totalPeopleRunWith: 12,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-emma',
        name: 'Emma Wouters',
        email: 'emma.wouters@runsemble.app',
        avatar: null,
        bio: 'Yoga & running - the perfect balance',
        city: 'Antwerp',
        lat: 51.2238,
        lng: 4.4172,
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'afternoon',
        xp: 680,
        streak: 9,
        longestStreak: 18,
        lastActiveDate: now.toISOString().split('T')[0],
        totalRuns: 53,
        totalPeopleRunWith: 22,
        isAvailable: true,
        availableUntil: addHours(now, 3),
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-kai',
        name: 'Kai Maes',
        email: 'kai.maes@runsemble.app',
        avatar: null,
        bio: 'Speed demon. Training for sub-40 10K',
        city: 'Antwerp',
        lat: 51.2008,
        lng: 4.4035,
        preferredSport: 'running',
        paceLevel: 'advanced',
        schedulePreference: 'evening',
        xp: 1100,
        streak: 11,
        longestStreak: 25,
        lastActiveDate: subDays(now, 1).toISOString().split('T')[0],
        totalRuns: 76,
        totalPeopleRunWith: 28,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-anja',
        name: 'Anja Janssen',
        email: 'anja.janssen@runsemble.app',
        avatar: null,
        bio: 'Running since 2019. Love discovering new routes in Antwerp!',
        city: 'Antwerp',
        lat: 51.215,
        lng: 4.431,
        preferredSport: 'running',
        paceLevel: 'intermediate',
        schedulePreference: 'morning',
        xp: 850,
        streak: 6,
        longestStreak: 20,
        lastActiveDate: now.toISOString().split('T')[0],
        totalRuns: 58,
        totalPeopleRunWith: 15,
        isAvailable: true,
        availableUntil: addHours(now, 1.5),
        privacyVisible: true,
        onboardingComplete: true,
      },
      {
        id: 'user-tomas',
        name: 'Tomas Dubois',
        email: 'tomas.dubois@runsemble.app',
        avatar: null,
        bio: 'New to running but loving the community vibe!',
        city: 'Antwerp',
        lat: 51.2052,
        lng: 4.415,
        preferredSport: 'running',
        paceLevel: 'beginner',
        schedulePreference: 'afternoon',
        xp: 90,
        streak: 2,
        longestStreak: 5,
        lastActiveDate: subDays(now, 2).toISOString().split('T')[0],
        totalRuns: 8,
        totalPeopleRunWith: 3,
        isAvailable: false,
        privacyVisible: true,
        onboardingComplete: true,
      },
    ],
  })

  console.log(`Created ${users.count} users`)

  // 3. Create 6 hotspot runs at Antwerp locations
  const hotspots = await db.hotspot.createMany({
    data: [
      {
        id: 'hotspot-1',
        name: 'Morning Loop - Stadspark',
        description: 'Easy 5K loop around the park. Perfect for beginners and recovery runs.',
        location: 'Stadspark, Antwerp',
        lat: 51.2163,
        lng: 4.4186,
        sportType: 'running',
        distanceKm: 5.0,
        paceRange: '6:00-7:00',
        startTime: addHours(now, 1),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: 'user-maya',
      },
      {
        id: 'hotspot-2',
        name: 'Speed Session - Scheldekaaien',
        description: 'Intervals along the river. Bring your A-game!',
        location: 'Scheldekaaien, Antwerp',
        lat: 51.2214,
        lng: 4.4163,
        sportType: 'running',
        distanceKm: 8.0,
        paceRange: '4:30-5:30',
        startTime: addHours(now, 3),
        recurringIntervalMin: 45,
        isActive: true,
        createdBy: 'user-kai',
      },
      {
        id: 'hotspot-3',
        name: 'Sunset Easy Run - Het Steen',
        description: 'Relaxed evening run starting from Het Steen. All paces welcome.',
        location: 'Het Steen, Antwerp',
        lat: 51.2241,
        lng: 4.4182,
        sportType: 'running',
        distanceKm: 4.0,
        paceRange: 'any',
        startTime: addHours(now, 5),
        recurringIntervalMin: 30,
        isActive: true,
        createdBy: 'user-emma',
      },
      {
        id: 'hotspot-4',
        name: 'Long Sunday Run - Hobokense Polder',
        description: 'Sunday long run through the polder. Flat and scenic.',
        location: 'Hobokense Polder, Antwerp',
        lat: 51.1976,
        lng: 4.3545,
        sportType: 'running',
        distanceKm: 12.0,
        paceRange: '5:30-6:30',
        startTime: addHours(now, 24),
        recurringIntervalMin: 60,
        isActive: true,
        createdBy: 'user-jonas',
      },
      {
        id: 'hotspot-5',
        name: 'Lunch Break Tempo - Stadionplein',
        description: 'Quick tempo run during lunch. 30-min blast!',
        location: 'Stadionplein, Antwerp',
        lat: 51.2065,
        lng: 4.4222,
        sportType: 'running',
        distanceKm: 6.0,
        paceRange: '5:00-6:00',
        startTime: subHours(now, 2),
        recurringIntervalMin: 30,
        isActive: false,
        createdBy: 'user-lars',
      },
      {
        id: 'hotspot-6',
        name: 'Trail Tuesday - Linkeroever',
        description: 'Off-road trails on the left bank. Muddy and fun!',
        location: 'Linkeroever, Antwerp',
        lat: 51.215,
        lng: 4.385,
        sportType: 'running',
        distanceKm: 7.0,
        paceRange: '6:00-7:30',
        startTime: addHours(now, 26),
        recurringIntervalMin: 45,
        isActive: true,
        createdBy: 'user-maya',
      },
    ],
  })

  console.log(`Created ${hotspots.count} hotspots`)

  // 4. Create 4 groups
  const groups = await db.runGroup.createMany({
    data: [
      {
        id: 'group-1',
        name: 'Antwerp Morning Runners',
        description: 'Early birds who love a sunrise run. We meet at different locations around the city.',
        isPublic: true,
        coverImage: null,
        city: 'Antwerp',
        createdBy: 'user-maya',
      },
      {
        id: 'group-2',
        name: 'Sunday Long Run Crew',
        description: 'Building endurance one Sunday at a time. All levels welcome - we regroup!',
        isPublic: true,
        coverImage: null,
        city: 'Antwerp',
        createdBy: 'user-jonas',
      },
      {
        id: 'group-3',
        name: 'Trail Blazers Antwerp',
        description: 'For those who prefer dirt over pavement. We explore trails in and around Antwerp.',
        isPublic: true,
        coverImage: null,
        city: 'Antwerp',
        createdBy: 'user-maya',
      },
      {
        id: 'group-4',
        name: 'Speed Demons',
        description: 'Private group for sub-40 10K runners. Invitation only.',
        isPublic: false,
        coverImage: null,
        city: 'Antwerp',
        createdBy: 'user-kai',
      },
    ],
  })

  console.log(`Created ${groups.count} groups`)

  // 5. Add group members
  const groupMembers = await db.groupMember.createMany({
    data: [
      // Antwerp Morning Runners
      { id: 'gm-1-1', groupId: 'group-1', userId: 'user-maya', role: 'owner' },
      { id: 'gm-1-2', groupId: 'group-1', userId: 'user-lars', role: 'admin' },
      { id: 'gm-1-3', groupId: 'group-1', userId: 'user-anja', role: 'member' },
      { id: 'gm-1-4', groupId: 'group-1', userId: 'user-sophie', role: 'member' },
      { id: 'gm-1-5', groupId: 'group-1', userId: 'user-emma', role: 'member' },
      // Sunday Long Run Crew
      { id: 'gm-2-1', groupId: 'group-2', userId: 'user-jonas', role: 'owner' },
      { id: 'gm-2-2', groupId: 'group-2', userId: 'user-emma', role: 'admin' },
      { id: 'gm-2-3', groupId: 'group-2', userId: 'user-lars', role: 'member' },
      { id: 'gm-2-4', groupId: 'group-2', userId: 'user-tomas', role: 'member' },
      // Trail Blazers Antwerp
      { id: 'gm-3-1', groupId: 'group-3', userId: 'user-maya', role: 'owner' },
      { id: 'gm-3-2', groupId: 'group-3', userId: 'user-kai', role: 'member' },
      { id: 'gm-3-3', groupId: 'group-3', userId: 'user-anja', role: 'member' },
      // Speed Demons
      { id: 'gm-4-1', groupId: 'group-4', userId: 'user-kai', role: 'owner' },
      { id: 'gm-4-2', groupId: 'group-4', userId: 'user-jonas', role: 'member' },
      { id: 'gm-4-3', groupId: 'group-4', userId: 'user-maya', role: 'member' },
    ],
  })

  console.log(`Created ${groupMembers.count} group memberships`)

  // 6. Add hotspot participants
  const hotspotParticipants = await db.hotspotParticipant.createMany({
    data: [
      { id: 'hp-1', hotspotId: 'hotspot-1', userId: 'user-maya', status: 'joined' },
      { id: 'hp-2', hotspotId: 'hotspot-1', userId: 'user-sophie', status: 'joined' },
      { id: 'hp-3', hotspotId: 'hotspot-1', userId: 'user-anja', status: 'joined' },
      { id: 'hp-4', hotspotId: 'hotspot-2', userId: 'user-kai', status: 'joined' },
      { id: 'hp-5', hotspotId: 'hotspot-2', userId: 'user-jonas', status: 'joined' },
      { id: 'hp-6', hotspotId: 'hotspot-2', userId: 'user-maya', status: 'joined' },
      { id: 'hp-7', hotspotId: 'hotspot-3', userId: 'user-emma', status: 'joined' },
      { id: 'hp-8', hotspotId: 'hotspot-3', userId: 'user-lars', status: 'joined' },
      { id: 'hp-9', hotspotId: 'hotspot-3', userId: 'user-tomas', status: 'joined' },
      { id: 'hp-10', hotspotId: 'hotspot-4', userId: 'user-jonas', status: 'joined' },
      { id: 'hp-11', hotspotId: 'hotspot-4', userId: 'user-emma', status: 'joined' },
      { id: 'hp-12', hotspotId: 'hotspot-4', userId: 'user-lars', status: 'joined' },
      { id: 'hp-13', hotspotId: 'hotspot-4', userId: 'user-tomas', status: 'joined' },
      { id: 'hp-14', hotspotId: 'hotspot-5', userId: 'user-lars', status: 'completed' },
      { id: 'hp-15', hotspotId: 'hotspot-5', userId: 'user-anja', status: 'completed' },
      { id: 'hp-16', hotspotId: 'hotspot-5', userId: 'user-sophie', status: 'completed' },
      { id: 'hp-17', hotspotId: 'hotspot-6', userId: 'user-maya', status: 'joined' },
      { id: 'hp-18', hotspotId: 'hotspot-6', userId: 'user-kai', status: 'joined' },
    ],
  })

  console.log(`Created ${hotspotParticipants.count} hotspot participants`)

  // 7. Create feed posts
  const feedPosts = await db.feedPost.createMany({
    data: [
      {
        id: 'post-1',
        authorId: 'user-maya',
        groupId: null,
        content: 'Just crushed 10K in the rain at Stadspark! Nothing beats the feeling of a tough run done.',
        postType: 'moment',
      },
      {
        id: 'post-2',
        authorId: 'user-sophie',
        groupId: null,
        content: 'Milestone: Completed my first 10K today! 1:02:34 - not fast, but I did it! Thanks to everyone in the Morning Runners group for the support',
        postType: 'milestone',
      },
      {
        id: 'post-3',
        authorId: 'user-kai',
        groupId: 'group-4',
        content: 'Sub-39 10K today! 38:47. The speed work is paying off.',
        postType: 'milestone',
      },
      {
        id: 'post-4',
        authorId: 'user-emma',
        groupId: 'group-1',
        content: 'Beautiful sunrise run this morning with the crew. 6 of us showed up at 6AM - the energy was amazing!',
        postType: 'moment',
      },
      {
        id: 'post-5',
        authorId: 'user-tomas',
        groupId: null,
        content: 'Any tips for a beginner dealing with shin splints? I just started running 3 weeks ago and my shins are killing me.',
        postType: 'question',
      },
      {
        id: 'post-6',
        authorId: 'user-jonas',
        groupId: 'group-2',
        content: "Who's in for the 18K long run this Sunday? Route: Hobokense Polder -> Blokkersdijk -> Scheldekaaien and back. Pace: ~5:45/km",
        postType: 'challenge',
      },
      {
        id: 'post-7',
        authorId: 'user-anja',
        groupId: 'group-3',
        content: 'Found an amazing new trail section near Linkeroever! Roots, mud, and a hidden bridge - pure trail paradise.',
        postType: 'moment',
      },
      {
        id: 'post-8',
        authorId: 'user-lars',
        groupId: null,
        content: "Streak day 21! Three weeks of running every single day. The kids think I'm crazy but it feels incredible.",
        postType: 'milestone',
      },
      {
        id: 'post-9',
        authorId: 'user-emma',
        groupId: null,
        content: 'Yoga + easy 5K = perfect Saturday morning. Balance is everything.',
        postType: 'moment',
      },
      {
        id: 'post-10',
        authorId: 'user-maya',
        groupId: 'group-3',
        content: 'Trail Tuesday this week: Linkeroever forest loop, 7K. Bring your trail shoes and sense of adventure! Meeting at 18:30.',
        postType: 'challenge',
      },
    ],
  })

  console.log(`Created ${feedPosts.count} feed posts`)

  // 8. Create badges
  const badges = await db.userBadge.createMany({
    data: [
      // Maya
      { id: 'badge-1', userId: 'user-maya', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-2', userId: 'user-maya', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-3', userId: 'user-maya', badgeType: 'streak_30', title: 'Monthly Legend', description: '30-day running streak', icon: 'star' },
      { id: 'badge-4', userId: 'user-maya', badgeType: 'social_butterfly', title: 'Social Butterfly', description: 'Ran with 25+ different people', icon: 'heart' },
      { id: 'badge-5', userId: 'user-maya', badgeType: 'early_bird', title: 'Early Bird', description: 'Completed 20+ morning runs', icon: 'sun' },
      // Jonas
      { id: 'badge-6', userId: 'user-jonas', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-7', userId: 'user-jonas', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-8', userId: 'user-jonas', badgeType: 'streak_21', title: 'Three-Week Titan', description: '21-day running streak', icon: 'trophy' },
      { id: 'badge-9', userId: 'user-jonas', badgeType: 'night_owl', title: 'Night Owl', description: 'Completed 15+ evening runs', icon: 'moon' },
      // Sophie
      { id: 'badge-10', userId: 'user-sophie', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-11', userId: 'user-sophie', badgeType: 'streak_3', title: 'Hat Trick', description: '3-day running streak', icon: 'zap' },
      // Lars
      { id: 'badge-12', userId: 'user-lars', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-13', userId: 'user-lars', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-14', userId: 'user-lars', badgeType: 'streak_14', title: 'Two-Week Wonder', description: '14-day running streak', icon: 'sparkles' },
      // Emma
      { id: 'badge-15', userId: 'user-emma', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-16', userId: 'user-emma', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-17', userId: 'user-emma', badgeType: 'social_butterfly', title: 'Social Butterfly', description: 'Ran with 20+ different people', icon: 'heart' },
      // Kai
      { id: 'badge-18', userId: 'user-kai', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-19', userId: 'user-kai', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-20', userId: 'user-kai', badgeType: 'speed_demon', title: 'Speed Demon', description: 'Ran a sub-40 10K', icon: 'bolt' },
      { id: 'badge-21', userId: 'user-kai', badgeType: 'night_owl', title: 'Night Owl', description: 'Completed 15+ evening runs', icon: 'moon' },
      // Anja
      { id: 'badge-22', userId: 'user-anja', badgeType: 'first_run', title: 'First Steps', description: 'Completed your first run', icon: 'runner' },
      { id: 'badge-23', userId: 'user-anja', badgeType: 'streak_7', title: 'Week Warrior', description: '7-day running streak', icon: 'flame' },
      { id: 'badge-24', userId: 'user-anja', badgeType: 'explorer', title: 'Explorer', description: 'Joined 5+ different hotspots', icon: 'compass' },
    ],
  })

  console.log(`Created ${badges.count} badges`)

  // 9. Create group chat messages (ChatMessage rows with groupId set, recipientId null)
  const groupChats = await db.chatMessage.createMany({
    data: [
      // Antwerp Morning Runners chat
      { id: 'gc-1', groupId: 'group-1', senderId: 'user-maya', content: "Good morning crew! Who's joining the Stadspark loop today?" },
      { id: 'gc-2', groupId: 'group-1', senderId: 'user-lars', content: "I'll be there! Can we do 6K instead of 5K today?" },
      { id: 'gc-3', groupId: 'group-1', senderId: 'user-anja', content: 'Count me in! Bringing a friend who wants to try running' },
      { id: 'gc-4', groupId: 'group-1', senderId: 'user-sophie', content: "I'll try to make it! Still a bit nervous about keeping up" },
      { id: 'gc-5', groupId: 'group-1', senderId: 'user-maya', content: "Don't worry Sophie, we always regroup! See you all at 6:30" },
      // Sunday Long Run Crew chat
      { id: 'gc-6', groupId: 'group-2', senderId: 'user-jonas', content: 'Route is set for Sunday: 18K starting from Hobokense Polder. 8:00 AM.' },
      { id: 'gc-7', groupId: 'group-2', senderId: 'user-emma', content: "Perfect! I've been building up to this distance. What's the planned pace?" },
      { id: 'gc-8', groupId: 'group-2', senderId: 'user-jonas', content: 'Thinking 5:45/km with walk breaks every 3K. Nobody gets left behind.' },
      { id: 'gc-9', groupId: 'group-2', senderId: 'user-tomas', content: 'This will be my longest run ever! Should I carb-load the night before?' },
      { id: 'gc-10', groupId: 'group-2', senderId: 'user-lars', content: 'Yes Tomas! Pasta party the night before is a tradition' },
      // Trail Blazers chat
      { id: 'gc-11', groupId: 'group-3', senderId: 'user-maya', content: 'Found a new trail section near Linkeroever - roots, mud, hidden bridge!' },
      { id: 'gc-12', groupId: 'group-3', senderId: 'user-kai', content: 'Sounds amazing! Is it technical or more runnable?' },
      { id: 'gc-13', groupId: 'group-3', senderId: 'user-maya', content: 'Mix of both. Bring your grippiest trail shoes!' },
      // Speed Demons chat
      { id: 'gc-14', groupId: 'group-4', senderId: 'user-kai', content: 'Session plan for Thursday: 6x800m at 3:20 pace with 2min recovery' },
      { id: 'gc-15', groupId: 'group-4', senderId: 'user-jonas', content: "Solid session. I'll aim for 3:25s - still building back after my cold" },
      { id: 'gc-16', groupId: 'group-4', senderId: 'user-maya', content: "I'm in! The track at Bosuil or the Schelde straight?" },
      { id: 'gc-17', groupId: 'group-4', senderId: 'user-kai', content: 'Schelde straight - better surface and the views help forget the pain' },
    ],
  })

  console.log(`Created ${groupChats.count} group chat messages`)

  // 10. Create DMs
  const chatMessages = await db.chatMessage.createMany({
    data: [
      { id: 'dm-1', senderId: 'user-sophie', recipientId: 'user-maya', content: 'Thanks for being so encouraging on my first group run!' },
      { id: 'dm-2', senderId: 'user-maya', recipientId: 'user-sophie', content: 'You did amazing! The fact that you finished the full 5K says everything.' },
      { id: 'dm-3', senderId: 'user-tomas', recipientId: 'user-lars', content: 'Hey Lars, any advice for dealing with knee pain after running?' },
      { id: 'dm-4', senderId: 'user-lars', recipientId: 'user-tomas', content: 'I had the same issue! Try foam rolling your quads and IT band. Also, check your cadence - aim for ~170 spm' },
      { id: 'dm-5', senderId: 'user-emma', recipientId: 'user-jonas', content: 'The Sunday route looks great! Can we add a water stop around 8K?' },
      { id: 'dm-6', senderId: 'user-jonas', recipientId: 'user-emma', content: "Good idea! There's a fountain at the Blokkersdijk entrance. I'll add it to the route plan" },
    ],
  })

  console.log(`Created ${chatMessages.count} direct messages`)

  // 11. Create run invites
  const invites = await db.runInvite.createMany({
    data: [
      {
        id: 'invite-1',
        senderId: 'user-maya',
        recipientId: 'user-tomas',
        message: "Hey Tomas! We're doing an easy 5K at Stadspark tomorrow morning. Want to join? It's perfect for building up!",
        status: 'pending',
      },
      {
        id: 'invite-2',
        senderId: 'user-kai',
        recipientId: 'user-anja',
        message: "Anja, the Speed Demons are doing a track session. You're getting fast - want to try it out?",
        status: 'pending',
      },
      {
        id: 'invite-3',
        senderId: 'user-lars',
        recipientId: 'user-sophie',
        message: "Sunday long run crew! We'd love to have you. We always regroup so no pressure on pace.",
        status: 'accepted',
      },
      {
        id: 'invite-4',
        senderId: 'user-jonas',
        recipientId: 'user-emma',
        message: 'Partnership for the Antwerp 10K in March? We could pace each other!',
        status: 'accepted',
      },
    ],
  })

  console.log(`Created ${invites.count} run invites`)

  // 12. Create run ratings for completed hotspots
  const ratings = await db.runRating.createMany({
    data: [
      { id: 'rating-1', hotspotId: 'hotspot-5', userId: 'user-lars', rating: 5, comment: 'Great lunch break run! Perfect tempo effort.' },
      { id: 'rating-2', hotspotId: 'hotspot-5', userId: 'user-anja', rating: 4, comment: 'Good route but a bit crowded at noon.' },
      { id: 'rating-3', hotspotId: 'hotspot-5', userId: 'user-sophie', rating: 5, comment: 'Lars was so encouraging! Loved every minute.' },
    ],
  })

  console.log(`Created ${ratings.count} run ratings`)

  // ── Post-processing for the newer features ──────────────────────────────────
  // Give each user a realistic total distance so the distance leaderboard is
  // meaningful (~6.5 km per logged run, with a little variance).
  const seededUsers = await db.user.findMany()
  for (const u of seededUsers) {
    const km = Math.round(u.totalRuns * 6.5 * (0.85 + Math.random() * 0.3) * 10) / 10
    await db.user.update({
      where: { id: u.id },
      data: { totalDistanceKm: km, totalDurationSec: Math.round(km * 5.5 * 60) },
    })
  }

  // Mark curated city spots as official so they recur + show an "Official" badge.
  await db.hotspot.updateMany({
    where: { id: { in: ['hotspot-1', 'hotspot-3', 'hotspot-5'] } },
    data: { isOfficial: true },
  })

  // Give posts real PostLike rows so the counts are toggleable from the start.
  // These rows ARE the count — there is no counter column to keep in step.
  const seededPosts = await db.feedPost.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  const seededUserIds = seededUsers.map((u) => u.id)
  for (const [i, p] of seededPosts.entries()) {
    // A varied but deterministic spread, so the seeded feed doesn't look uniform.
    const likers = seededUserIds.slice(0, (i * 3 + 2) % (seededUserIds.length + 1))
    if (likers.length > 0) {
      await db.postLike.createMany({ data: likers.map((userId) => ({ postId: p.id, userId })) })
    }
  }

  console.log('Seed complete!')

  return {
    users: 8,
    hotspots: 6,
    groups: 4,
    groupMembers: 15,
    hotspotParticipants: 18,
    feedPosts: 10,
    badges: 24,
    groupChats: 17,
    chatMessages: 6,
    invites: 4,
    ratings: 3,
  }
}

// Wiping and reseeding the database is a dev tool — never available in production.
function guardProduction() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Seeding is disabled in production' }, { status: 403 })
  }
  return null
}

export async function POST() {
  const blocked = guardProduction()
  if (blocked) return blocked
  try {
    const result = await seed()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Seed failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Seed failed' },
      { status: 500 }
    )
  }
}

// Deliberately POST-only. Seeding wipes the database, and a GET is reachable by
// anything that follows a link — a crawler, a prefetch, a pasted URL. The
// production guards above are the safety net, not the design.
