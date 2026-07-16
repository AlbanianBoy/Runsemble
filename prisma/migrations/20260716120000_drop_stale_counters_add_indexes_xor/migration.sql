-- Drop denormalised counters that duplicate relational truth.
--
-- FeedPost.likes / FeedPost.comments were kept in step with the PostLike and
-- PostComment rows by hand (a transaction on the like route, a recount on the
-- comment route) while GET /api/feed already read the real thing via _count.
-- Two sources of truth that agree only as long as every writer remembers to
-- update both. The rows are now the only source, so drift is not possible
-- rather than merely avoided. Verified 0 drift before dropping.
ALTER TABLE "FeedPost" DROP COLUMN "likes";
ALTER TABLE "FeedPost" DROP COLUMN "comments";

-- RunGroup.totalKmThisWeek was seed-only: both group routes already compute
-- km-this-week from members' real RunSessions since Monday and override this
-- column in the response, so nothing ever read it.
ALTER TABLE "RunGroup" DROP COLUMN "totalKmThisWeek";

-- The leaderboard sorts by five metrics but only xp was indexed, so every other
-- board was a full scan plus a sort on each request.
CREATE INDEX "User_streak_idx" ON "User"("streak");
CREATE INDEX "User_totalRuns_idx" ON "User"("totalRuns");
CREATE INDEX "User_totalDistanceKm_idx" ON "User"("totalDistanceKm");
CREATE INDEX "User_totalPeopleRunWith_idx" ON "User"("totalPeopleRunWith");

-- ChatMessage carries both DMs (recipientId set) and group chat (groupId set).
-- The model comment said "exactly one of recipientId or groupId must be
-- non-null" but nothing enforced it, so a bug could write a message that is
-- neither or both — invisible to every reader, since both filter on one column.
-- Verified 0 existing rows violate this before adding the constraint.
ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_dm_xor_group"
  CHECK (("recipientId" IS NULL) <> ("groupId" IS NULL));
