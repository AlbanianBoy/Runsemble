/*
  Warnings:

  - A unique constraint covering the columns `[hotspotId,userId]` on the table `RunRating` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clientRunId]` on the table `RunSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RunSession" ADD COLUMN     "clientRunId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationToken_userId_type_idx" ON "VerificationToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RunRating_hotspotId_userId_key" ON "RunRating"("hotspotId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RunSession_clientRunId_key" ON "RunSession"("clientRunId");

-- CreateIndex
CREATE INDEX "User_xp_idx" ON "User"("xp");

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
