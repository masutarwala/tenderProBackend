-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "stage" "TenderStage",
ADD COLUMN     "dueDaysOffset" INTEGER,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
