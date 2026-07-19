-- ─── Session token hashing migration ─────────────────────────────────────────
-- Run this ONCE against your production database BEFORE deploying the
-- security/critical-fixes branch to production.
--
-- What this does:
--   1. Adds a tokenHash column to Session
--   2. Backfills it: sha256 of the existing plaintext tokens
--   3. Makes it NOT NULL + UNIQUE
--   4. Drops the plaintext token column
--
-- After running:
--   • Update schema.prisma: rename `token String @unique` → `tokenHash String @unique`
--   • Update auth.ts: change the `token: tokenHash` field name to `tokenHash`
--     (the code already stores the hash value; only the column name changes)
--   • All existing sessions become INVALID — users will need to log in again.
--     This is intentional and expected: old sessions stored plaintext values
--     in the cookie; those cookies will no longer match.
--
-- Steps:

BEGIN;

-- Step 1: Add the new column (nullable so the backfill can run first)
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

-- Step 2: Backfill — sha256 of the existing plaintext tokens
UPDATE "Session"
SET "tokenHash" = encode(digest("token", 'sha256'), 'hex')
WHERE "tokenHash" IS NULL;
-- Note: digest() requires the pgcrypto extension.
-- If not installed: CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 3: Enforce NOT NULL and UNIQUE
ALTER TABLE "Session" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "Session" ADD CONSTRAINT "Session_tokenHash_key" UNIQUE ("tokenHash");
CREATE INDEX IF NOT EXISTS "Session_tokenHash_idx" ON "Session"("tokenHash");

-- Step 4: Drop the plaintext token column
-- WARNING: This is irreversible. All existing sessions will be invalidated.
-- Verify the application is deployed and using tokenHash BEFORE running this step.
ALTER TABLE "Session" DROP COLUMN "token";

COMMIT;
