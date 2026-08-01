-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "taskId" TEXT;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TenderTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
