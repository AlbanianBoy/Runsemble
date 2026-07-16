-- AlterTable
ALTER TABLE "User" ALTER COLUMN "schedulePreference" TYPE TEXT;
ALTER TABLE "User" ALTER COLUMN "schedulePreference" SET DEFAULT '';

-- DropEnum
DROP TYPE IF EXISTS "SchedulePreference";