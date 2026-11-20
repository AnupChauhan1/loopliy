-- AlterTable
ALTER TABLE "Client" ADD COLUMN "portalUserId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "clientVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Client_portalUserId_key" ON "Client"("portalUserId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_portalUserId_fkey"
FOREIGN KEY ("portalUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
