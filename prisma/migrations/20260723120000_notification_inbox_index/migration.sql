-- The notification inbox reads "this user's rows, newest first, 50 of them".
-- The only index on the table was (userId, read), which serves the unread badge
-- count but cannot supply that ordering — so opening the bell fetched every
-- notification the user had ever received and sorted them in memory. Additive;
-- the read-flag index stays for the count.
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification"("userId", "createdAt");
