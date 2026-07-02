# Task 10: Runsemble API Routes

## Status: COMPLETED

## Summary
Created all 12 API route files for the Runsemble social fitness app under `src/app/api/`.

## Files Created

### Users API
- `src/app/api/users/route.ts` — GET all users (with badges + group memberships), POST create user (onboarding with duplicate email check)
- `src/app/api/users/[id]/route.ts` — GET single user (with badges, groups, recent hotspot joins), PATCH update user (whitelist of allowed fields)

### Hotspots API
- `src/app/api/hotspots/route.ts` — GET all active upcoming hotspots (with `participantCount`, `participantNames`, `minutesUntil` computed fields), POST create hotspot
- `src/app/api/hotspots/[id]/route.ts` — GET single hotspot with full participant details and ratings
- `src/app/api/hotspots/[id]/join/route.ts` — POST join (with duplicate check), DELETE leave (via `?userId=` query param)

### Groups API
- `src/app/api/groups/route.ts` — GET all public groups with members, POST create group (auto-adds creator as owner)
- `src/app/api/groups/[id]/route.ts` — GET single group with members, recent posts, message count
- `src/app/api/groups/[id]/join/route.ts` — POST join (with duplicate check, updates memberCount), DELETE leave (prevents owner from leaving)
- `src/app/api/groups/[id]/chat/route.ts` — GET messages (last 50, desc order, reversed for client), POST send message (verifies group membership)

### Feed API
- `src/app/api/feed/route.ts` — GET all posts with author info + group info, POST create post
- `src/app/api/feed/[id]/like/route.ts` — POST increment likes count

### Badges API
- `src/app/api/badges/route.ts` — GET badges by `?userId=` query param

## Implementation Notes
- All routes use `import { db } from '@/lib/db'` for Prisma database access
- All responses use `NextResponse.json()` with proper error handling (try/catch)
- Dynamic route params use `params: Promise<{ id: string }>` (Next.js 16 async params pattern)
- Hotspots include computed `minutesUntil` field based on `startTime - now`
- Group join/leave updates the `memberCount` field on the group
- Group chat POST verifies sender is a group member (403 if not)
- Old placeholder `src/app/api/route.ts` removed
- Zero TypeScript compilation errors in all new API files
