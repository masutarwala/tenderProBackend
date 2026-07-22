-- AlterTable
ALTER TABLE "TenderUpdateChecklist" ADD COLUMN "assignedRoleId" TEXT;

-- AddForeignKey
ALTER TABLE "TenderUpdateChecklist" ADD CONSTRAINT "TenderUpdateChecklist_assignedRoleId_fkey" FOREIGN KEY ("assignedRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
