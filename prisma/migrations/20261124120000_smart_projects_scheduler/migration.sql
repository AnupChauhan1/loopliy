-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "currentCycle" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cycleStartDate" TIMESTAMP(3),
ADD COLUMN     "planStructure" TEXT NOT NULL DEFAULT 'customised',
ADD COLUMN     "projectType" TEXT NOT NULL DEFAULT 'one_time',
ADD COLUMN     "service" TEXT,
ADD COLUMN     "tenureUnit" TEXT,
ADD COLUMN     "tenureValue" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "carriedForwardAt" TIMESTAMP(3),
ADD COLUMN     "cycle" INTEGER,
ADD COLUMN     "dayOffset" INTEGER,
ADD COLUMN     "deliverableUrl" TEXT,
ADD COLUMN     "isIndividual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOverdue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "workNote" TEXT;

-- CreateIndex
CREATE INDEX "Task_organizationId_idx" ON "Task"("organizationId");

-- Backfill: project tasks inherit their project's organization
UPDATE "Task" t SET "organizationId" = p."organizationId"
FROM "Project" p WHERE t."projectId" = p."id" AND t."organizationId" IS NULL;

-- Backfill: standalone tasks inherit their creator's organization
UPDATE "Task" t SET "organizationId" = u."organizationId", "isIndividual" = true
FROM "User" u WHERE t."projectId" IS NULL AND t."createdById" = u."id" AND t."organizationId" IS NULL;

-- Backfill: remaining standalone tasks inherit an assignee's organization
UPDATE "Task" t SET "organizationId" = sub."organizationId", "isIndividual" = true
FROM (
  SELECT DISTINCT ON (ta."taskId") ta."taskId", u."organizationId"
  FROM "TaskAssignee" ta JOIN "User" u ON u."id" = ta."userId"
) sub
WHERE t."id" = sub."taskId" AND t."projectId" IS NULL AND t."organizationId" IS NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "taskTemplate" JSONB;
