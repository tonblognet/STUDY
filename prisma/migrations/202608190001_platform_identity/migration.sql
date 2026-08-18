ALTER TABLE "User" ADD COLUMN "platformUserId" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_platformUserId_key" ON "User"("platformUserId");
