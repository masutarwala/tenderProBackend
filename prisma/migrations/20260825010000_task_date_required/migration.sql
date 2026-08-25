-- AlterTable: replace TaskTemplate's fixed "due days offset" with a simple
-- "date required?" toggle — the actual date is now picked per-tender-task.
ALTER TABLE "TaskTemplate" DROP COLUMN "dueDaysOffset",
ADD COLUMN     "dateRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: TenderTask remembers whether its due date is required, copied
-- from the template at import time.
ALTER TABLE "TenderTask" ADD COLUMN     "dateRequired" BOOLEAN NOT NULL DEFAULT false;
