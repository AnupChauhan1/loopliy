-- Add the two-stage creative approval workflow.
-- AlterTable
ALTER TABLE "CreativeRequest" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "creativeType" TEXT NOT NULL DEFAULT 'graphic',
ADD COLUMN     "managerApproverId" TEXT,
ADD COLUMN     "sourceLink" TEXT,
ADD COLUMN     "strategyApproverId" TEXT,
ADD COLUMN     "submissionNotes" TEXT,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- Create the role required for assigned strategy approvers.
INSERT INTO "Role" ("id", "name", "description")
VALUES ('c3772d26-d5e8-44c9-9068-d94005c5f22c', 'Strategy Approver', 'Creative strategy approvals')
ON CONFLICT ("name") DO NOTHING;

UPDATE "CreativeRequest" AS creative
SET "strategyApproverId" = creative."reviewerId"
FROM "UserRole" AS user_role
JOIN "Role" AS role ON role."id" = user_role."roleId"
WHERE creative."reviewerId" = user_role."userId"
  AND role."name" = 'Strategy Approver';

UPDATE "CreativeRequest" AS creative
SET "managerApproverId" = creative."reviewerId"
FROM "UserRole" AS user_role
JOIN "Role" AS role ON role."id" = user_role."roleId"
WHERE creative."reviewerId" = user_role."userId"
  AND role."name" IN ('Super Admin', 'Admin', 'Project Manager');

ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep existing active requests in the new gated flow. Final decisions remain final.
UPDATE "CreativeRequest"
SET "status" = CASE "status"
    WHEN 'brief' THEN 'draft'
    WHEN 'in_progress' THEN 'draft'
    WHEN 'internal_review' THEN 'submitted_strategy'
    WHEN 'changes_requested' THEN 'strategy_changes_requested'
    WHEN 'client_review' THEN 'submitted_strategy'
    WHEN 'approved' THEN 'final_approved'
    ELSE "status"
END;

-- CreateTable
CREATE TABLE "CreativeApprovalEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreativeApprovalEvent_requestId_createdAt_idx" ON "CreativeApprovalEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeApprovalEvent_versionId_idx" ON "CreativeApprovalEvent"("versionId");

-- CreateIndex
CREATE INDEX "CreativeApprovalEvent_actorId_idx" ON "CreativeApprovalEvent"("actorId");

-- CreateIndex
CREATE INDEX "CreativeRequest_strategyApproverId_idx" ON "CreativeRequest"("strategyApproverId");

-- CreateIndex
CREATE INDEX "CreativeRequest_managerApproverId_idx" ON "CreativeRequest"("managerApproverId");

-- CreateIndex
CREATE INDEX "CreativeRequest_clientId_idx" ON "CreativeRequest"("clientId");

-- CreateIndex
CREATE INDEX "CreativeRequest_projectId_idx" ON "CreativeRequest"("projectId");

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_strategyApproverId_fkey" FOREIGN KEY ("strategyApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeRequest" ADD CONSTRAINT "CreativeRequest_managerApproverId_fkey" FOREIGN KEY ("managerApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApprovalEvent" ADD CONSTRAINT "CreativeApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApprovalEvent" ADD CONSTRAINT "CreativeApprovalEvent_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CreativeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApprovalEvent" ADD CONSTRAINT "CreativeApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve the latest legacy review record for each previously reviewed version.
INSERT INTO "CreativeApprovalEvent" ("id", "requestId", "versionId", "actorId", "actorName", "stage", "action", "message", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text),
    version."requestId",
    version."id",
    version."reviewedById",
    CONCAT(actor."firstName", ' ', actor."lastName"),
    'legacy',
    version."status",
    version."feedback",
    COALESCE(version."reviewedAt", version."createdAt")
FROM "CreativeVersion" AS version
JOIN "User" AS actor ON actor."id" = version."reviewedById"
WHERE version."reviewedById" IS NOT NULL
;
