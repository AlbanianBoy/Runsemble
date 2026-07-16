-- Turn the documented-by-comment String columns into real enums.
--
-- Each of these carried a "// a, b, c" comment listing its values, which is not
-- a constraint: PATCH /api/users/[id] allowlists field NAMES, not values, so any
-- string at all could be stored and nothing would notice until a comparison
-- quietly stopped matching.
--
-- Every existing value was checked against these sets before writing this
-- migration (several tables are empty), so every USING cast below succeeds.
-- The API validates the same sets first (src/lib/enums.ts), so a bad value is a
-- 400 rather than the 500 a raw Prisma enum error would produce.

CREATE TYPE "PaceLevel" AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE "SchedulePreference" AS ENUM ('morning', 'afternoon', 'evening');
CREATE TYPE "SportType" AS ENUM ('running', 'trail', 'walking');
CREATE TYPE "PostType" AS ENUM ('moment', 'milestone', 'question', 'challenge');
CREATE TYPE "GroupRole" AS ENUM ('member', 'admin', 'owner');
CREATE TYPE "ParticipantStatus" AS ENUM ('joined', 'here', 'completed', 'cancelled');
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined');

-- The default has to come off before the type changes and go back on after:
-- Postgres cannot cast an existing text default to the new enum in place.
ALTER TABLE "User" ALTER COLUMN "paceLevel" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "paceLevel" TYPE "PaceLevel" USING "paceLevel"::"PaceLevel";
ALTER TABLE "User" ALTER COLUMN "paceLevel" SET DEFAULT 'beginner';

ALTER TABLE "User" ALTER COLUMN "schedulePreference" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "schedulePreference" TYPE "SchedulePreference" USING "schedulePreference"::"SchedulePreference";
ALTER TABLE "User" ALTER COLUMN "schedulePreference" SET DEFAULT 'evening';

ALTER TABLE "Hotspot" ALTER COLUMN "sportType" DROP DEFAULT;
ALTER TABLE "Hotspot" ALTER COLUMN "sportType" TYPE "SportType" USING "sportType"::"SportType";
ALTER TABLE "Hotspot" ALTER COLUMN "sportType" SET DEFAULT 'running';

ALTER TABLE "HotspotParticipant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "HotspotParticipant" ALTER COLUMN "status" TYPE "ParticipantStatus" USING "status"::"ParticipantStatus";
ALTER TABLE "HotspotParticipant" ALTER COLUMN "status" SET DEFAULT 'joined';

ALTER TABLE "GroupMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "GroupMember" ALTER COLUMN "role" TYPE "GroupRole" USING "role"::"GroupRole";
ALTER TABLE "GroupMember" ALTER COLUMN "role" SET DEFAULT 'member';

ALTER TABLE "FeedPost" ALTER COLUMN "postType" DROP DEFAULT;
ALTER TABLE "FeedPost" ALTER COLUMN "postType" TYPE "PostType" USING "postType"::"PostType";
ALTER TABLE "FeedPost" ALTER COLUMN "postType" SET DEFAULT 'moment';

ALTER TABLE "RunSession" ALTER COLUMN "sportType" DROP DEFAULT;
ALTER TABLE "RunSession" ALTER COLUMN "sportType" TYPE "SportType" USING "sportType"::"SportType";
ALTER TABLE "RunSession" ALTER COLUMN "sportType" SET DEFAULT 'running';

ALTER TABLE "RunInvite" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RunInvite" ALTER COLUMN "status" TYPE "InviteStatus" USING "status"::"InviteStatus";
ALTER TABLE "RunInvite" ALTER COLUMN "status" SET DEFAULT 'pending';
