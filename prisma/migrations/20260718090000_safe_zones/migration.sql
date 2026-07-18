-- Safe zones: areas where a user's location is never shared.
-- The 200m display fuzz makes a pin approximate, but an approximate pin at the
-- same spot every evening still says where someone sleeps. Additive only.

CREATE TABLE "SafeZone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Home',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafeZone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafeZone_userId_idx" ON "SafeZone"("userId");

ALTER TABLE "SafeZone" ADD CONSTRAINT "SafeZone_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
