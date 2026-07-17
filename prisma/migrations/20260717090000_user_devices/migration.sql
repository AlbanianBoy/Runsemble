-- One row per push device, replacing the single User.fcmToken column.
--
-- FCM issues a token per app install, so a single column meant the second device
-- to register overwrote the first — and the first then received nothing, for
-- ever, with no error on either side. A phone plus a tablet, or one reinstall,
-- was enough to lose push silently.
--
-- The token is the natural key: FCM can rotate it at any time (reinstall,
-- restore, refresh), so rows are upserted on the token rather than on any device
-- identifier we invent.

CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDevice_token_key" ON "UserDevice"("token");
CREATE INDEX "UserDevice_userId_enabled_idx" ON "UserDevice"("userId", "enabled");

ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry existing tokens over before dropping the column, so nobody who already
-- registered has to reopen the app to get push back. gen_random_uuid() is
-- built in from Postgres 13 (pgcrypto not required).
INSERT INTO "UserDevice" ("id", "userId", "token", "platform")
SELECT gen_random_uuid()::text, "id", "fcmToken", 'unknown'
FROM "User"
WHERE "fcmToken" IS NOT NULL AND "fcmToken" <> '';

ALTER TABLE "User" DROP COLUMN "fcmToken";
