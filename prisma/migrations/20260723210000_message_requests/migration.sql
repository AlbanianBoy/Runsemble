-- Message requests: a stranger's first message knocks instead of arriving.
--
-- Anyone could DM anyone, and every message fired a push. On an app built
-- around meeting people you have not met, that makes the inbox and the lock
-- screen reachable by any account that can find you on the map. Blocking works
-- only after the message has landed and buzzed — which is after the harm.
--
-- Additive: no existing conversation is affected. With no rows in this table,
-- decideDelivery falls through to "have they ever messaged me / are we
-- buddies", so every conversation that already exists keeps delivering exactly
-- as it did.
CREATE TYPE "MessageRequestStatus" AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE "MessageRequest" (
  "id"          TEXT NOT NULL,
  "senderId"    TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status"      "MessageRequestStatus" NOT NULL DEFAULT 'pending',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "MessageRequest_pkey" PRIMARY KEY ("id")
);

-- One request per direction. A sender who writes three times before being
-- answered has made one request, not three.
CREATE UNIQUE INDEX "MessageRequest_senderId_recipientId_key"
  ON "MessageRequest"("senderId", "recipientId");

-- The recipient's "who is waiting on me" list, newest first.
CREATE INDEX "MessageRequest_recipientId_status_createdAt_idx"
  ON "MessageRequest"("recipientId", "status", "createdAt");

ALTER TABLE "MessageRequest"
  ADD CONSTRAINT "MessageRequest_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageRequest"
  ADD CONSTRAINT "MessageRequest_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
