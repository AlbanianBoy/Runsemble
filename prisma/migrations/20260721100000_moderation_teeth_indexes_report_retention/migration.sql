-- Audit follow-ups that need schema. All additive or widening — safe on a live
-- table, no data loss.

-- Moderation teeth: a suspended account is refused a session and hidden from
-- discovery. Null = good standing.
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "suspendedReason" TEXT;

-- Reports must outlive the reporter deleting their account, or abuse cases can be
-- erased by the accused. Drop the Cascade FK, make reporterId nullable, re-add as
-- SetNull. Existing rows keep their reporterId; only future deletions null it.
ALTER TABLE "Report" DROP CONSTRAINT "Report_reporterId_fkey";
ALTER TABLE "Report" ALTER COLUMN "reporterId" DROP NOT NULL;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Feed is the hottest read and paginates by (createdAt, id) desc.
CREATE INDEX "FeedPost_createdAt_id_idx" ON "FeedPost"("createdAt", "id");
CREATE INDEX "FeedPost_authorId_idx" ON "FeedPost"("authorId");
CREATE INDEX "FeedPost_groupId_idx" ON "FeedPost"("groupId");

-- Reverse-direction block lookup (X blocked-by me) and the DM/unread read path.
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");
CREATE INDEX "ChatMessage_recipientId_read_idx" ON "ChatMessage"("recipientId", "read");
