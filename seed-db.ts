import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const now = new Date()
  
  // Clear all
  await db.runRating.deleteMany()
  await db.hotspotParticipant.deleteMany()
  await db.userBadge.deleteMany()
  await db.groupChatMessage.deleteMany()
  await db.chatMessage.deleteMany()
  await db.runInvite.deleteMany()
  await db.feedPost.deleteMany()
  await db.groupMember.deleteMany()
  await db.runGroup.deleteMany()
  await db.hotspot.deleteMany()
  await db.user.deleteMany()
  
  // Create users
  const u1 = await db.user.create({ data: { id:'u1', name:'Maya Chen', email:'maya@r.app', city:'Antwerp', lat:51.2205, lng:4.41, paceLevel:'advanced', schedulePreference:'morning', xp:1250, streak:14, longestStreak:21, totalRuns:87, totalPeopleRunWith:34, bio:'Trail runner & sunrise chaser', onboardingComplete:true, isAvailable:true, privacyVisible:true }})
  const u2 = await db.user.create({ data: { id:'u2', name:'Jonas De Smedt', email:'jonas@r.app', city:'Antwerp', lat:51.216, lng:4.422, paceLevel:'advanced', schedulePreference:'evening', xp:980, streak:7, longestStreak:30, totalRuns:62, totalPeopleRunWith:19, bio:'Marathon training — sub 3h goal', onboardingComplete:true, privacyVisible:true }})
  const u3 = await db.user.create({ data: { id:'u3', name:'Sophie Vd Berg', email:'sophie@r.app', city:'Antwerp', lat:51.208, lng:4.43, paceLevel:'beginner', schedulePreference:'afternoon', xp:220, streak:3, longestStreak:7, totalRuns:12, totalPeopleRunWith:5, bio:'Just finished my first 10K!', onboardingComplete:true, privacyVisible:true }})
  const u4 = await db.user.create({ data: { id:'u4', name:'Lars Peeters', email:'lars@r.app', city:'Antwerp', lat:51.212, lng:4.395, paceLevel:'intermediate', schedulePreference:'evening', xp:540, streak:5, longestStreak:14, totalRuns:38, totalPeopleRunWith:12, bio:'Dad runner. Best pace setter are my kids.', onboardingComplete:true, isAvailable:true, privacyVisible:true }})
  const u5 = await db.user.create({ data: { id:'u5', name:'Emma Wouters', email:'emma@r.app', city:'Antwerp', lat:51.224, lng:4.418, paceLevel:'intermediate', schedulePreference:'morning', xp:680, streak:9, longestStreak:18, totalRuns:45, totalPeopleRunWith:22, bio:'Yoga + running = balance', onboardingComplete:true, privacyVisible:true }})
  const u6 = await db.user.create({ data: { id:'u6', name:'Kai Maes', email:'kai@r.app', city:'Antwerp', lat:51.2, lng:4.402, paceLevel:'advanced', schedulePreference:'morning', xp:1100, streak:11, longestStreak:25, totalRuns:71, totalPeopleRunWith:28, bio:'Training for sub-40 10K', onboardingComplete:true, isAvailable:true, privacyVisible:true }})
  const u7 = await db.user.create({ data: { id:'u7', name:'Anja Janssen', email:'anja@r.app', city:'Antwerp', lat:51.215, lng:4.435, paceLevel:'intermediate', schedulePreference:'afternoon', xp:850, streak:6, longestStreak:12, totalRuns:52, totalPeopleRunWith:16, bio:'Route explorer — show me a new path', onboardingComplete:true, privacyVisible:true }})
  const u8 = await db.user.create({ data: { id:'u8', name:'Tomas Dubois', email:'tomas@r.app', city:'Antwerp', lat:51.205, lng:4.415, paceLevel:'beginner', schedulePreference:'evening', xp:90, streak:1, longestStreak:3, totalRuns:5, totalPeopleRunWith:2, bio:'New to running, loving it so far', onboardingComplete:true, privacyVisible:true }})

  // Create hotspots with FUTURE times
  const h1 = await db.hotspot.create({ data: { id:'h1', name:'Morning Loop Stadspark', description:'Easy 5K loop through the park, all paces welcome', location:'Stadspark, Antwerp', lat:51.2185, lng:4.4250, sportType:'running', distanceKm:5, paceRange:'any', startTime: new Date(now.getTime() + 2*60*60*1000), recurringIntervalMin:60, isActive:true, createdBy:'u1' }})
  const h2 = await db.hotspot.create({ data: { id:'h2', name:'Scheldekaaien Speedwork', description:'Interval training along the river', location:'Scheldekaaien, Antwerp', lat:51.2120, lng:4.4180, sportType:'running', distanceKm:8, paceRange:'intermediate', startTime: new Date(now.getTime() + 5*60*60*1000), recurringIntervalMin:90, isActive:true, createdBy:'u2' }})
  const h3 = await db.hotspot.create({ data: { id:'h3', name:'Sunrise Het Steen', description:'Beautiful morning run starting at Het Steen', location:'Het Steen, Antwerp', lat:51.2240, lng:4.4160, sportType:'running', distanceKm:6, paceRange:'any', startTime: new Date(now.getTime() + 24*60*60*1000), recurringIntervalMin:60, isActive:true, createdBy:'u5' }})
  const h4 = await db.hotspot.create({ data: { id:'h4', name:'Hobokense Polder Trail', description:'Off-road trails through Hobokense Polder', location:'Hobokense Polder, Antwerp', lat:51.1930, lng:4.3700, sportType:'trail', distanceKm:10, paceRange:'advanced', startTime: new Date(now.getTime() + 28*60*60*1000), recurringIntervalMin:120, isActive:true, createdBy:'u6' }})
  const h5 = await db.hotspot.create({ data: { id:'h5', name:'Stadionplein Easy Jog', description:'Relaxed jog, perfect for beginners', location:'Stadionplein, Antwerp', lat:51.2050, lng:4.4300, sportType:'running', distanceKm:3, paceRange:'beginner', startTime: new Date(now.getTime() + 1.5*60*60*1000), recurringIntervalMin:45, isActive:true, createdBy:'u3' }})
  const h6 = await db.hotspot.create({ data: { id:'h6', name:'Linkeroever Sunset Run', description:'Cross the bridge and enjoy the sunset', location:'Linkeroever, Antwerp', lat:51.2100, lng:4.3900, sportType:'running', distanceKm:7, paceRange:'any', startTime: new Date(now.getTime() + 8*60*60*1000), recurringIntervalMin:60, isActive:true, createdBy:'u4' }})

  // Add hotspot participants
  await db.hotspotParticipant.createMany({ data: [
    { hotspotId:'h1', userId:'u2', status:'joined' },
    { hotspotId:'h1', userId:'u5', status:'joined' },
    { hotspotId:'h1', userId:'u7', status:'joined' },
    { hotspotId:'h2', userId:'u1', status:'joined' },
    { hotspotId:'h2', userId:'u6', status:'joined' },
    { hotspotId:'h3', userId:'u3', status:'joined' },
    { hotspotId:'h3', userId:'u4', status:'joined' },
    { hotspotId:'h3', userId:'u8', status:'joined' },
    { hotspotId:'h4', userId:'u1', status:'joined' },
    { hotspotId:'h4', userId:'u6', status:'joined' },
    { hotspotId:'h5', userId:'u3', status:'joined' },
    { hotspotId:'h5', userId:'u8', status:'joined' },
    { hotspotId:'h6', userId:'u2', status:'joined' },
    { hotspotId:'h6', userId:'u7', status:'joined' },
  ]})

  // Create groups
  const g1 = await db.runGroup.create({ data: { id:'g1', name:'Antwerp Morning Crew', description:'Early birds who love sunrise runs along the Schelde', isPublic:true, city:'Antwerp', totalKmThisWeek:42.5, memberCount:4, createdBy:'u1', coverImage:null }})
  const g2 = await db.runGroup.create({ data: { id:'g2', name:'Weekend Warriors', description:'Saturday long runs and Sunday recovery jogs', isPublic:true, city:'Antwerp', totalKmThisWeek:28.0, memberCount:5, createdBy:'u2', coverImage:null }})
  const g3 = await db.runGroup.create({ data: { id:'g3', name:'Speed Demons', description:'For runners chasing PRs. Speedwork, intervals & tempo runs', isPublic:false, city:'Antwerp', totalKmThisWeek:35.0, memberCount:3, createdBy:'u6', coverImage:null }})
  const g4 = await db.runGroup.create({ data: { id:'g4', name:'Beginner Friendly Runs', description:'No pressure, just fun. Walk-run intervals welcome!', isPublic:true, city:'Antwerp', totalKmThisWeek:15.0, memberCount:4, createdBy:'u3', coverImage:null }})

  // Add group members
  await db.groupMember.createMany({ data: [
    { groupId:'g1', userId:'u1', role:'owner' },
    { groupId:'g1', userId:'u5', role:'admin' },
    { groupId:'g1', userId:'u7', role:'member' },
    { groupId:'g1', userId:'u3', role:'member' },
    { groupId:'g2', userId:'u2', role:'owner' },
    { groupId:'g2', userId:'u4', role:'admin' },
    { groupId:'g2', userId:'u1', role:'member' },
    { groupId:'g2', userId:'u8', role:'member' },
    { groupId:'g2', userId:'u6', role:'member' },
    { groupId:'g3', userId:'u6', role:'owner' },
    { groupId:'g3', userId:'u1', role:'member' },
    { groupId:'g3', userId:'u2', role:'member' },
    { groupId:'g4', userId:'u3', role:'owner' },
    { groupId:'g4', userId:'u8', role:'member' },
    { groupId:'g4', userId:'u5', role:'member' },
    { groupId:'g4', userId:'u4', role:'member' },
  ]})

  // Create feed posts
  await db.feedPost.createMany({ data: [
    { id:'p1', authorId:'u1', groupId:'g1', content:'Just crushed a 5K personal best this morning! 🎉 22:34 — 30 seconds faster than last month. The morning crew vibes are unreal.', postType:'milestone', likes:12, comments:4, createdAt: new Date(now.getTime() - 2*60*60*1000) },
    { id:'p2', authorId:'u2', groupId:'g2', content:'Anyone up for a long run this Saturday? Planning 18K along the Schelde. Pace around 5:30/km.', postType:'question', likes:8, comments:6, createdAt: new Date(now.getTime() - 4*60*60*1000) },
    { id:'p3', authorId:'u5', content:'Morning yoga + 5K recovery run = perfect start to the day 🧘‍♀️', postType:'moment', likes:15, comments:2, createdAt: new Date(now.getTime() - 6*60*60*1000) },
    { id:'p4', authorId:'u3', groupId:'g4', content:'I did it! My first ever 10K without stopping! 🏃‍♀️ 1:02:15. Thank you to everyone in this group who encouraged me!', postType:'milestone', likes:28, comments:11, createdAt: new Date(now.getTime() - 8*60*60*1000) },
    { id:'p5', authorId:'u6', groupId:'g3', content:'Speedwork session: 6x800m at 3:05 avg. Legs are jelly but the data looks good 💪', postType:'moment', likes:9, comments:3, createdAt: new Date(now.getTime() - 12*60*60*1000) },
    { id:'p6', authorId:'u4', content:'Who else is running in the rain today? There is something magical about it.', postType:'moment', likes:7, comments:5, createdAt: new Date(now.getTime() - 1*60*60*1000) },
    { id:'p7', authorId:'u7', groupId:'g1', content:'Found an amazing new route through the old harbor district. cobblestones, canals, and a coffee shop at the end. Running tourism at its finest!', postType:'moment', likes:18, comments:7, createdAt: new Date(now.getTime() - 18*60*60*1000) },
    { id:'p8', authorId:'u1', groupId:'g3', content:'Challenge: run 50K this week as a group! Who is in? We are at 35K already 🎯', postType:'challenge', likes:22, comments:14, createdAt: new Date(now.getTime() - 24*60*60*1000) },
    { id:'p9', authorId:'u8', groupId:'g4', content:'Week 3 of Couch to 5K complete! The group runs make such a difference. I would have given up by now running alone.', postType:'moment', likes:14, comments:6, createdAt: new Date(now.getTime() - 36*60*60*1000) },
    { id:'p10', authorId:'u2', content:'Marathon in 8 weeks. Nervous but excited. The training plan says 32K long run this weekend. Send help (and gels).', postType:'moment', likes:16, comments:9, createdAt: new Date(now.getTime() - 48*60*60*1000) },
  ]})

  // Create badges
  await db.userBadge.createMany({ data: [
    { userId:'u1', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u1', badgeType:'streak_7', title:'Week Warrior', description:'7-day running streak', icon:'🔥' },
    { userId:'u1', badgeType:'streak_30', title:'Monthly Legend', description:'30-day running streak', icon:'⚡' },
    { userId:'u1', badgeType:'social_butterfly', title:'Social Butterfly', description:'Ran with 20+ people', icon:'🦋' },
    { userId:'u2', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u2', badgeType:'streak_7', title:'Week Warrior', description:'7-day running streak', icon:'🔥' },
    { userId:'u2', badgeType:'early_bird', title:'Early Bird', description:'10 morning runs completed', icon:'🌅' },
    { userId:'u3', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u3', badgeType:'social_butterfly', title:'Social Butterfly', description:'Ran with 20+ people', icon:'🦋' },
    { userId:'u4', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u4', badgeType:'streak_7', title:'Week Warrior', description:'7-day running streak', icon:'🔥' },
    { userId:'u5', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u5', badgeType:'streak_7', title:'Week Warrior', description:'7-day running streak', icon:'🔥' },
    { userId:'u5', badgeType:'night_owl', title:'Night Owl', description:'10 evening runs completed', icon:'🦉' },
    { userId:'u6', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u6', badgeType:'streak_7', title:'Week Warrior', description:'7-day running streak', icon:'🔥' },
    { userId:'u7', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
    { userId:'u8', badgeType:'first_run', title:'First Steps', description:'Completed your first run', icon:'🏃' },
  ]})

  // Create group chat messages
  const chatMsgs = [
    { groupId:'g1', senderId:'u1', content:'Morning run at 6:30 tomorrow! Who is in?', createdAt: new Date(now.getTime() - 3*60*60*1000) },
    { groupId:'g1', senderId:'u5', content:'Count me in! Planning to do 8K', createdAt: new Date(now.getTime() - 2.5*60*60*1000) },
    { groupId:'g1', senderId:'u7', content:'I will be there. Can we start from the usual spot?', createdAt: new Date(now.getTime() - 2*60*60*1000) },
    { groupId:'g1', senderId:'u1', content:'Yes! Stadspark entrance as always 🌅', createdAt: new Date(now.getTime() - 1.5*60*60*1000) },
    { groupId:'g1', senderId:'u3', content:'New here, can I join even if I am slow?', createdAt: new Date(now.getTime() - 60*60*1000) },
    { groupId:'g1', senderId:'u1', content:'Absolutely! We always regroup. No one gets left behind 💪', createdAt: new Date(now.getTime() - 30*60*1000) },
    { groupId:'g2', senderId:'u2', content:'Saturday long run: 18K. Meeting at 8am Scheldekaaien.', createdAt: new Date(now.getTime() - 10*60*60*1000) },
    { groupId:'g2', senderId:'u4', content:'Sounds great. I will bring gels for everyone.', createdAt: new Date(now.getTime() - 9*60*60*1000) },
    { groupId:'g2', senderId:'u8', content:'Can I do 10K and turn back? 18K might be too much for me still', createdAt: new Date(now.getTime() - 8*60*60*1000) },
    { groupId:'g2', senderId:'u2', content:'Of course! We will have a turnaround point at 9K', createdAt: new Date(now.getTime() - 7.5*60*60*1000) },
    { groupId:'g2', senderId:'u1', content:'In! Need the long run for marathon training', createdAt: new Date(now.getTime() - 7*60*60*1000) },
    { groupId:'g3', senderId:'u6', content:'Tuesday speedwork: 8x400m. Target 85-90s per rep.', createdAt: new Date(now.getTime() - 20*60*60*1000) },
    { groupId:'g3', senderId:'u2', content:'Lets go. My legs are still recovering from Sunday though 😅', createdAt: new Date(now.getTime() - 19*60*60*1000) },
    { groupId:'g3', senderId:'u1', content:'Sub 90s reps? Challenge accepted', createdAt: new Date(now.getTime() - 18*60*60*1000) },
    { groupId:'g4', senderId:'u3', content:'Welcome new members! Our next group run is Wednesday evening at 7pm', createdAt: new Date(now.getTime() - 14*60*60*1000) },
    { groupId:'g4', senderId:'u8', content:'Excited! This is my first group run ever', createdAt: new Date(now.getTime() - 13*60*60*1000) },
    { groupId:'g4', senderId:'u5', content:'You will love it! The group energy makes everything easier', createdAt: new Date(now.getTime() - 12.5*60*60*1000) },
  ]
  for (const msg of chatMsgs) {
    await db.groupChatMessage.create({ data: msg })
  }

  // Direct messages
  await db.chatMessage.createMany({ data: [
    { senderId:'u1', recipientId:'u2', content:'Hey! Want to pair up for the Saturday long run?' },
    { senderId:'u2', recipientId:'u1', content:'Definitely! What pace are you thinking?' },
    { senderId:'u1', recipientId:'u2', content:'Around 5:30/km, maybe a bit faster in the second half' },
    { senderId:'u2', recipientId:'u1', content:'Perfect, that is exactly my marathon pace. See you Saturday!' },
    { senderId:'u3', recipientId:'u5', content:'Thanks for the yoga tips! My recovery runs feel so much better now' },
    { senderId:'u5', recipientId:'u3', content:'Anytime! Consistency is key. See you at the group run?' },
  ]})

  // Run invites
  await db.runInvite.createMany({ data: [
    { senderId:'u1', recipientId:'u8', message:'Join our morning run tomorrow! Perfect for your level', status:'pending' },
    { senderId:'u2', recipientId:'u3', message:'Long run this Saturday — you can do 10K with us!', status:'pending' },
    { senderId:'u5', recipientId:'u8', message:'Yoga session before the group run?', status:'accepted' },
    { senderId:'u6', recipientId:'u4', message:'Speedwork session — want to push your limits?', status:'accepted' },
  ]})

  // ── Post-processing for the new features ────────────────────────────────────
  // Give each user a realistic total distance so the distance leaderboard is
  // meaningful (roughly 6.5 km per logged run, with a little variance).
  const users = await db.user.findMany()
  for (const u of users) {
    const km = Math.round(u.totalRuns * 6.5 * (0.85 + Math.random() * 0.3) * 10) / 10
    await db.user.update({
      where: { id: u.id },
      data: {
        totalDistanceKm: km,
        totalDurationSec: Math.round(km * 5.5 * 60), // ~5.5 min/km
      },
    })
  }

  // A few tracked runs this week so the computed group "km this week" stat
  // has life out of the box.
  await db.runSession.createMany({ data: [
    { userId:'u1', distanceKm:8.4, durationSec:2940, avgPaceSecPerKm:350, calories:504, endedAt:new Date(now.getTime()-20*60*60*1000), xpEarned:104 },
    { userId:'u2', distanceKm:12.1, durationSec:3630, avgPaceSecPerKm:300, calories:726, endedAt:new Date(now.getTime()-44*60*60*1000), xpEarned:141 },
    { userId:'u5', distanceKm:5.2, durationSec:1820, avgPaceSecPerKm:350, calories:312, endedAt:new Date(now.getTime()-3*60*60*1000), xpEarned:72 },
    { userId:'u3', distanceKm:4.0, durationSec:1560, avgPaceSecPerKm:390, calories:240, endedAt:new Date(now.getTime()-26*60*60*1000), xpEarned:60 },
  ]})

  // Emma is free later today — demos the "Coming up" availability window.
  await db.user.update({ where: { id: 'u5' }, data: { isAvailable: false, availableFrom: new Date(now.getTime() + 2*60*60*1000) } })

  // Genders (optional) so women-only runs have members to show.
  await db.user.updateMany({ where: { id: { in: ['u1','u3','u5','u7'] } }, data: { gender: 'female' } })
  await db.user.updateMany({ where: { id: { in: ['u2','u4','u6','u8'] } }, data: { gender: 'male' } })

  // Mark curated city spots as official + give them weekly schedules & audiences.
  await db.hotspot.update({ where: { id: 'h1' }, data: { isOfficial: true, daysOfWeek: '1,3,5', audience: 'all' } })      // Mon/Wed/Fri
  await db.hotspot.update({ where: { id: 'h3' }, data: { isOfficial: true, daysOfWeek: '0,6', audience: 'all' } })        // weekends
  await db.hotspot.update({ where: { id: 'h5' }, data: { isOfficial: true, daysOfWeek: '2,4', audience: 'beginner' } })   // Tue/Thu, beginners

  // A recurring women-only official run.
  await db.hotspot.create({ data: {
    id: 'h7', name: 'Women Who Run — Evening Loop', description: 'A welcoming women-only group run. All paces.',
    location: 'Nachtegalenpark, Antwerp', lat: 51.1935, lng: 4.4045, sportType: 'running', distanceKm: 5, paceRange: 'any',
    startTime: new Date(now.getTime() + 3*60*60*1000), recurringIntervalMin: 1440, daysOfWeek: '1,4', audience: 'women',
    isOfficial: true, isActive: true, createdBy: 'u5',
  }})

  // Buddy relationships (both directions) among the seed users.
  const buddyPairs: [string,string][] = [['u1','u5'],['u1','u7'],['u2','u4'],['u3','u8'],['u6','u2']]
  for (const [a,b] of buddyPairs) {
    await db.buddy.createMany({ data: [{ userId:a, buddyId:b }, { userId:b, buddyId:a }] })
  }

  // Community challenges.
  await db.challenge.create({ data: {
    id:'c1', title:'City 500K', description:'Log 500 km together across the community this month.',
    metric:'distance', goal:500, scope:'global', icon:'🌍',
    startsAt: new Date(now.getTime() - 5*24*60*60*1000), endsAt: new Date(now.getTime() + 20*24*60*60*1000), createdBy:'u1',
  }})
  await db.challenge.create({ data: {
    id:'c2', title:'Meet 5 New Runners', description:'Run with 5 people you have never run with before.',
    metric:'buddies', goal:5, scope:'global', icon:'🤝',
    startsAt: new Date(now.getTime() - 2*24*60*60*1000), endsAt: new Date(now.getTime() + 12*24*60*60*1000), createdBy:'u3',
  }})
  await db.challenge.create({ data: {
    id:'c3', title:'10 Runs This Month', description:'Show up 10 times. Consistency over speed.',
    metric:'runs', goal:10, scope:'global', icon:'🔥',
    startsAt: new Date(now.getTime() - 3*24*60*60*1000), endsAt: new Date(now.getTime() + 24*24*60*60*1000), createdBy:'u2',
  }})
  await db.challengeParticipant.createMany({ data: [
    { challengeId:'c1', userId:'u1' }, { challengeId:'c1', userId:'u2' }, { challengeId:'c1', userId:'u6' },
    { challengeId:'c2', userId:'u3' }, { challengeId:'c2', userId:'u5' },
    { challengeId:'c3', userId:'u1' }, { challengeId:'c3', userId:'u4' },
  ]})

  // Backfill PostLike rows so like counts are real and toggleable from the start.
  const posts = await db.feedPost.findMany({ select: { id: true, likes: true } })
  const allUserIds = users.map((u) => u.id)
  for (const p of posts) {
    const likers = allUserIds.slice(0, Math.min(p.likes, allUserIds.length))
    if (likers.length > 0) {
      await db.postLike.createMany({ data: likers.map((userId) => ({ postId: p.id, userId })) })
    }
    await db.feedPost.update({ where: { id: p.id }, data: { likes: likers.length } })
  }

  console.log('✅ Database seeded successfully!')
  console.log(`  Users: 8, Hotspots: 6 (3 official), Groups: 4, Posts: 10, Badges: 18, Chat msgs: 17`)
  
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
