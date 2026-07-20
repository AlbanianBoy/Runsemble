-- DPIA action items that need columns. All additive, all safe on a live table.

-- A8 (age gate): self-declared birthdate, stored so the age check is evidenced.
ALTER TABLE "User" ADD COLUMN "birthdate" TIMESTAMP(3);

-- A2 (per-purpose consent): analytics is a separate purpose from the core
-- service and must be separately consentable. Off by default — existing users
-- have not opted in, so false is the correct and lawful starting value.
ALTER TABLE "User" ADD COLUMN "analyticsConsent" BOOLEAN NOT NULL DEFAULT false;

-- A4 (retention): marks a run whose exact trace has been coarsened, so the daily
-- cron processes each row once. Null = raw trace still present.
ALTER TABLE "RunSession" ADD COLUMN "pathCoarsenedAt" TIMESTAMP(3);

CREATE INDEX "RunSession_pathCoarsenedAt_endedAt_idx"
  ON "RunSession"("pathCoarsenedAt", "endedAt");
