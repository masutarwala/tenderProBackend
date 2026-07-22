-- AlterTable
ALTER TABLE "TenderUpdateChecklist" ADD COLUMN "decision" TEXT;

-- DropIndex
DROP INDEX "StageApproval_tenderId_phase_roleId_key";

-- CreateIndex
CREATE INDEX "StageApproval_tenderId_phase_roleId_idx" ON "StageApproval"("tenderId", "phase", "roleId");
