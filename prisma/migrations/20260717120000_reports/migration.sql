-- Reports + moderation queue.
--
-- This app arranges for strangers to meet in person, so a way to flag someone
-- and a queue behind it is duty of care, not a feature. Block only hides someone
-- from the reporter and tells nobody.

CREATE TYPE "ReportSubjectType" AS ENUM ('user', 'post', 'message');
CREATE TYPE "ReportReason" AS ENUM ('harassment', 'spam', 'inappropriate', 'unsafe', 'impersonation', 'other');
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "subjectType" "ReportSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "evidence" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- One report per person per subject: re-filing updates rather than piling up.
CREATE UNIQUE INDEX "Report_reporterId_subjectType_subjectId_key" ON "Report"("reporterId", "subjectType", "subjectId");
-- The queue.
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
-- All reports about one subject.
CREATE INDEX "Report_subjectType_subjectId_idx" ON "Report"("subjectType", "subjectId");

ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
