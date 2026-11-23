-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyToken" TEXT,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3);

-- Backfill: all pre-existing accounts are treated as verified and approved
UPDATE "User" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL;
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;
