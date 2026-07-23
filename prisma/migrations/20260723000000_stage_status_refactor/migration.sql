-- Consolidate Tender pipeline state (bidStage/prospectStatus/opportunityStatus)
-- into a single Stage + Status pair, and simplify ApprovalRecord.overallStatus
-- to the same two-value vocabulary now that the Sent Back / Rejected / Dropped
-- flow has been removed entirely.

-- CreateEnum
CREATE TYPE "TenderStage" AS ENUM ('EVALUATION', 'PREPARATION', 'SUBMISSION');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('PENDING', 'COMPLETED');

-- Add new nullable columns first so we can backfill from the old ones before
-- dropping them.
ALTER TABLE "Tender" ADD COLUMN "stage" "TenderStage";
ALTER TABLE "Tender" ADD COLUMN "status" "TenderStatus";

-- Backfill: CLOSED -> Submission/Completed; a Dropped prospect is re-opened
-- into the live Evaluation queue (Drop no longer exists); everything else
-- keeps its stage, Pending.
UPDATE "Tender" SET
  "stage" = CASE WHEN "bidStage" = 'CLOSED' THEN 'SUBMISSION' ELSE "bidStage"::text END::"TenderStage",
  "status" = CASE WHEN "bidStage" = 'CLOSED' THEN 'COMPLETED' ELSE 'PENDING' END::"TenderStatus";

ALTER TABLE "Tender" ALTER COLUMN "stage" SET NOT NULL;
ALTER TABLE "Tender" ALTER COLUMN "stage" SET DEFAULT 'EVALUATION';
ALTER TABLE "Tender" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "Tender" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "Tender" DROP COLUMN "bidStage";
ALTER TABLE "Tender" DROP COLUMN "prospectStatus";
ALTER TABLE "Tender" DROP COLUMN "opportunityStatus";

-- ApprovalRecord.overallStatus: APPROVED -> COMPLETED; SENT_BACK/REJECTED are
-- re-opened to PENDING (no rejection branch exists anymore).
ALTER TABLE "ApprovalRecord" ADD COLUMN "overallStatus2" "TenderStatus";
UPDATE "ApprovalRecord" SET "overallStatus2" = CASE WHEN "overallStatus" = 'APPROVED' THEN 'COMPLETED' ELSE 'PENDING' END::"TenderStatus";
ALTER TABLE "ApprovalRecord" ALTER COLUMN "overallStatus2" SET NOT NULL;
ALTER TABLE "ApprovalRecord" ALTER COLUMN "overallStatus2" SET DEFAULT 'PENDING';
ALTER TABLE "ApprovalRecord" DROP COLUMN "overallStatus";
ALTER TABLE "ApprovalRecord" RENAME COLUMN "overallStatus2" TO "overallStatus";
ALTER TABLE "ApprovalRecord" DROP COLUMN "sentBackComments";

-- Drop reason no longer applies now that the Drop flow is removed.
ALTER TABLE "PreliminaryTenderInfo" DROP COLUMN "dropReason";

-- DropEnum
DROP TYPE "ApprovalOverallStatus";

-- DropEnum
DROP TYPE "BidStage";

-- DropEnum
DROP TYPE "DropReason";

-- DropEnum
DROP TYPE "OpportunityStatus";

-- DropEnum
DROP TYPE "ProspectStatus";
