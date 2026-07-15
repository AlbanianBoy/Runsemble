/*
  Warnings:

  - You are about to drop the `GroupChatMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GroupChatMessage" DROP CONSTRAINT "GroupChatMessage_groupId_fkey";

-- DropForeignKey
ALTER TABLE "GroupChatMessage" DROP CONSTRAINT "GroupChatMessage_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_actorId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcmToken" TEXT;

-- DropTable
DROP TABLE "GroupChatMessage";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RunGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
