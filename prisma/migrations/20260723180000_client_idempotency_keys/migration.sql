-- Idempotency for the mobile write paths.
--
-- /api/runs has had this since offline sync landed: the device generates an id
-- for the run it recorded, the column is unique per user, and a re-POST after a
-- timeout returns the run already stored instead of banking a second one. The
-- other high-frequency writes never got it, so a DM sent on a train — request
-- succeeds, response lost — arrives twice when the person taps send again.
--
-- Same shape, three more tables. Nullable because every row written so far has
-- no client id, and because server-side writes never will; Postgres does not
-- treat NULLs as equal, so a unique index still permits any number of them.
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "FeedPost"    ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- Scoped to the author, not global: the id is generated on a device and is only
-- meaningful within one account. A global unique would let one person's random
-- collision reject another person's message.
CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_senderId_clientId_key"
  ON "ChatMessage"("senderId", "clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "FeedPost_authorId_clientId_key"
  ON "FeedPost"("authorId", "clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "PostComment_authorId_clientId_key"
  ON "PostComment"("authorId", "clientId");
