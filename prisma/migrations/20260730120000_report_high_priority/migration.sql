-- Fast-track flag for reports tied to a women-only context (the reporter or the
-- reported user is in a women-only space). Additive + defaulted, so applying it to
-- the live table is safe and instant and touches no existing rows.
--
-- MUST be applied BEFORE the build that writes/reads it deploys: the report route
-- writes highPriority and the admin queue selects it, so a client that expects the
-- column against a table that lacks it errors on those paths. Apply this
-- (npx prisma migrate deploy), then deploy the code.

ALTER TABLE "Report" ADD COLUMN "highPriority" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Report_status_highPriority_createdAt_idx" ON "Report"("status", "highPriority", "createdAt");
