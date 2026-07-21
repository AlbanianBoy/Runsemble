-- Group discovery indexes.
--
-- Discovery now asks for "public groups in this city, newest first, 20 at a
-- time" instead of loading every group in the database. This index matches that
-- shape column-for-column so the page is a range scan rather than a sort of the
-- whole table.
CREATE INDEX IF NOT EXISTS "RunGroup_isPublic_city_createdAt_idx"
  ON "RunGroup"("isPublic", "city", "createdAt");

-- "Which groups is this user in?" backs both halves of the tab: your groups,
-- and excluding them from Discover. The existing unique index leads with
-- groupId, so a lookup by userId alone couldn't use it and scanned GroupMember.
CREATE INDEX IF NOT EXISTS "GroupMember_userId_idx"
  ON "GroupMember"("userId");
