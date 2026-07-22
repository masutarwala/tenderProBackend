-- DropForeignKey
ALTER TABLE "PreparationEmdDetails" DROP CONSTRAINT IF EXISTS "PreparationEmdDetails_tenderId_fkey";
ALTER TABLE "PreparationEmdDetails" DROP CONSTRAINT IF EXISTS "PreparationEmdDetails_updatedById_fkey";

-- DropTable
DROP TABLE IF EXISTS "PreparationEmdDetails";

-- AlterTable: new Outcome fields
ALTER TABLE "OutcomeRecord"
  ADD COLUMN "emdAmount" DOUBLE PRECISION,
  ADD COLUMN "emdDetails" TEXT,
  ADD COLUMN "outcomeDate" TIMESTAMP(3),
  ADD COLUMN "decisionDate" TIMESTAMP(3);

-- Data migration: rename the static "Move to Submission" checklist label to
-- "Preparation Done" on every existing tender so old rows keep matching the
-- gate/protected-label logic that now looks for the new label.
UPDATE "TenderUpdateChecklist" SET "label" = 'Preparation Done' WHERE "label" = 'Move to Submission';
