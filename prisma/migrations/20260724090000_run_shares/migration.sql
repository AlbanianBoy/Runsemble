-- Live run sharing: one unguessable link, one run, one thing to revoke.
--
-- A runner mid-run can mint a URL and send it to whoever they trust over their
-- own messenger. That person opens it in a browser, with no account and no app,
-- and watches a moving dot until the run ends. It is the "text someone before
-- you head out in the dark" habit, made real.
--
-- "token" is the credential, not an identifier — it is the only thing standing
-- between a stranger and a live position — so it holds 32 random bytes rather
-- than a cuid, and it is unique because a collision would hand one runner's
-- watcher the other runner's location.
--
-- lat/lng are stored EXACT. Every other coordinate in this schema passes
-- through safe-zone blinding and a 200m display fuzz; this one deliberately
-- does not, because a contact sent to a blurred 200m cell cannot find anyone.
-- The trade is bounded instead of open-ended: opt-in per run, revocable, dead
-- when the run ends, and hard-expired at four hours whatever happens. The daily
-- retention cron then deletes the row 24h past expiry, so a link that is dead
-- does not leave a location record behind.
--
-- Purely additive: a new table and its indexes. Nothing existing is read,
-- rewritten or constrained by this, and with no rows in it the app behaves
-- exactly as it did before.

CREATE TABLE "RunShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "sosAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RunShare_pkey" PRIMARY KEY ("id")
);

-- The watcher's whole lookup is by token, and it must be a single unique hit.
CREATE UNIQUE INDEX "RunShare_token_key" ON "RunShare"("token");

-- "Do I already have a live share?" — the runner's own rows, newest first.
CREATE INDEX "RunShare_userId_createdAt_idx" ON "RunShare"("userId", "createdAt");

-- The retention sweep deletes by expiry; without this it scans the whole table
-- every night, and this table grows once per shared run for ever.
CREATE INDEX "RunShare_expiresAt_idx" ON "RunShare"("expiresAt");

-- Cascade, not SetNull: a share belongs to the runner and means nothing without
-- them. Deleting the account must take the position with it — an orphaned row
-- here would be a bare GPS fix with no owner to erase it.
ALTER TABLE "RunShare" ADD CONSTRAINT "RunShare_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
