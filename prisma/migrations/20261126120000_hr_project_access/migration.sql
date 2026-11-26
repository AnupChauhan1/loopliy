-- AlterTable
ALTER TABLE "User" ADD COLUMN "projectAccessStatus" TEXT,
ADD COLUMN "projectAccessReason" TEXT,
ADD COLUMN "projectAccessRequestedAt" TIMESTAMP(3),
ADD COLUMN "projectAccessDecidedAt" TIMESTAMP(3);
