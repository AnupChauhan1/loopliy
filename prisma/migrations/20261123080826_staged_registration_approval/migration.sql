-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "hrApprovedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- Backfill: previously approved accounts count as HR+Admin approved
UPDATE "User" SET "hrApprovedAt" = "approvedAt" WHERE "approvedAt" IS NOT NULL AND "hrApprovedAt" IS NULL;
UPDATE "User" SET "adminApprovedAt" = "approvedAt" WHERE "approvedAt" IS NOT NULL AND "adminApprovedAt" IS NULL;
