-- Phone verification: a confirmed number is cheap Sybil friction and flips the
-- top-level `verified` trust badge. Three additive, nullable/defaulted columns —
-- nothing existing is read or rewritten, so this is safe to apply to the live
-- User table while the current build is running (it does not use these columns).
--
-- MUST be applied BEFORE the build that references these columns deploys: the
-- Prisma client selects every User scalar on getSessionUser(), so a client that
-- expects these columns against a table that lacks them fails every authed
-- request. Apply this (npx prisma migrate deploy), then deploy the code.

ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
