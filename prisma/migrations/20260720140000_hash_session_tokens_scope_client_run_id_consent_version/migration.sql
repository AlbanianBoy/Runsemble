-- Three changes, all in one migration because they all touch prod once.
--
-- 1. Session tokens are stored hashed instead of in the clear.
-- 2. clientRunId becomes unique per user rather than globally.
-- 3. Consent records which policy version was accepted.

-- ─── 1. Hash session tokens ──────────────────────────────────────────────────
-- Nobody gets logged out. The backfill computes the same SHA-256 the app will
-- compute from the cookie, so every existing cookie keeps matching its row.
-- This works precisely because the old column was plaintext — the one and only
-- upside of the thing we're fixing, and it disappears the moment we drop it.

ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT;

UPDATE "Session" SET "tokenHash" = encode(sha256("token"::bytea), 'hex');

-- Any row that somehow failed to backfill is an unusable session, not something
-- to keep around with a NULL hash.
DELETE FROM "Session" WHERE "tokenHash" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "tokenHash" SET NOT NULL;

DROP INDEX IF EXISTS "Session_token_key";
ALTER TABLE "Session" DROP COLUMN "token";

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- ─── 2. Scope clientRunId to the user ────────────────────────────────────────
-- Globally unique meant two users' devices generating the same id would have
-- the second run silently rejected as a duplicate.

DROP INDEX IF EXISTS "RunSession_clientRunId_key";
CREATE UNIQUE INDEX "RunSession_userId_clientRunId_key"
  ON "RunSession"("userId", "clientRunId");

-- ─── 3. Consent version ──────────────────────────────────────────────────────
-- Left NULL for existing accounts on purpose. They consented to *a* policy, but
-- we did not record which one, and inventing a version here would be a made-up
-- audit trail. NULL honestly means "predates version tracking".

ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;
