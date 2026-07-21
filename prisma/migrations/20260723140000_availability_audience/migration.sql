-- Who may see that you're free to run.
--
-- "Free at 18:30" is the most useful thing anyone publishes in this app and
-- also the most revealing: repeated over a few weeks it's a routine, and it
-- appears on the map beside a fuzzed home cell. Until now the only choice was
-- broadcasting it to every nearby stranger or hiding your profile entirely.
--
-- Defaults to 'everyone', so nobody's existing behaviour changes silently —
-- this adds a door, it doesn't close one. Enforced server-side in
-- toPublicUser via canSeeAvailability, which fails closed on any value it
-- doesn't recognise.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "availabilityAudience" TEXT NOT NULL DEFAULT 'everyone';
