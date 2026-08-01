-- CreateEnum
CREATE TYPE "AwardCriteria" AS ENUM ('AUCTION', 'LOWEST', 'QCBS');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentSide" AS ENUM ('TO_CLIENT', 'FROM_CLIENT');

-- AlterEnum (no nested BEGIN/COMMIT — `prisma migrate deploy` already wraps
-- the whole file in one transaction; a nested BEGIN aborts it). Existing
-- NO_GO rows map onto the renamed DROPPED value.
CREATE TYPE "Outcome_new" AS ENUM ('WON', 'LOST', 'DROPPED');
ALTER TABLE "OutcomeRecord" ALTER COLUMN "outcome" TYPE "Outcome_new" USING (
  CASE "outcome"::text WHEN 'NO_GO' THEN 'DROPPED' ELSE "outcome"::text END
)::"Outcome_new";
ALTER TYPE "Outcome" RENAME TO "Outcome_old";
ALTER TYPE "Outcome_new" RENAME TO "Outcome";
DROP TYPE "Outcome_old";

-- DropForeignKey
ALTER TABLE "ApprovalRecord" DROP CONSTRAINT "ApprovalRecord_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "AwardFormalities" DROP CONSTRAINT "AwardFormalities_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "AwardFormalities" DROP CONSTRAINT "AwardFormalities_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "BidSubmission" DROP CONSTRAINT "BidSubmission_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerContact" DROP CONSTRAINT "CustomerContact_customerId_fkey";

-- DropForeignKey
ALTER TABLE "DecisionMatrixCriterion" DROP CONSTRAINT "DecisionMatrixCriterion_matrixId_fkey";

-- DropForeignKey
ALTER TABLE "EmdPayment" DROP CONSTRAINT "EmdPayment_paidById_fkey";

-- DropForeignKey
ALTER TABLE "EmdPayment" DROP CONSTRAINT "EmdPayment_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "EmdRefund" DROP CONSTRAINT "EmdRefund_emdPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "EmdRefund" DROP CONSTRAINT "EmdRefund_initiatedById_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationRecord" DROP CONSTRAINT "EvaluationRecord_evaluatorId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationRecord" DROP CONSTRAINT "EvaluationRecord_matrixId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationRecord" DROP CONSTRAINT "EvaluationRecord_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationScore" DROP CONSTRAINT "EvaluationScore_criterionId_fkey";

-- DropForeignKey
ALTER TABLE "EvaluationScore" DROP CONSTRAINT "EvaluationScore_evaluationId_fkey";

-- DropForeignKey
ALTER TABLE "MasterApprovalItem" DROP CONSTRAINT "MasterApprovalItem_roleId_fkey";

-- DropForeignKey
ALTER TABLE "OpportunityDetails" DROP CONSTRAINT "OpportunityDetails_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "PreliminaryTenderInfo" DROP CONSTRAINT "PreliminaryTenderInfo_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "StageApproval" DROP CONSTRAINT "StageApproval_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "StageApproval" DROP CONSTRAINT "StageApproval_roleId_fkey";

-- DropForeignKey
ALTER TABLE "StageApproval" DROP CONSTRAINT "StageApproval_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "Tender" DROP CONSTRAINT "Tender_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Tender" DROP CONSTRAINT "Tender_extractorId_fkey";

-- DropForeignKey
ALTER TABLE "TenderFeeEmdRequirement" DROP CONSTRAINT "TenderFeeEmdRequirement_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "TenderOutput" DROP CONSTRAINT "TenderOutput_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "TenderQuery" DROP CONSTRAINT "TenderQuery_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TenderQuery" DROP CONSTRAINT "TenderQuery_targetRoleId_fkey";

-- DropForeignKey
ALTER TABLE "TenderQuery" DROP CONSTRAINT "TenderQuery_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "TenderQueryReply" DROP CONSTRAINT "TenderQueryReply_createdById_fkey";

-- DropForeignKey
ALTER TABLE "TenderQueryReply" DROP CONSTRAINT "TenderQueryReply_queryId_fkey";

-- DropForeignKey
ALTER TABLE "TenderUpdateChecklist" DROP CONSTRAINT "TenderUpdateChecklist_assignedRoleId_fkey";

-- DropForeignKey
ALTER TABLE "TenderUpdateChecklist" DROP CONSTRAINT "TenderUpdateChecklist_tenderId_fkey";

-- DropForeignKey
ALTER TABLE "TenderUpdateChecklist" DROP CONSTRAINT "TenderUpdateChecklist_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- Existing Document rows reference now-deleted polymorphic entities
-- (Opportunity/EmdPayment/EmdRefund/Pqi) with no reliable tenderId to
-- backfill — truncate before adding the new NOT NULL columns.
DELETE FROM "Document";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "category",
DROP COLUMN "entityId",
DROP COLUMN "entityType",
ADD COLUMN     "side" "DocumentSide" NOT NULL,
ADD COLUMN     "tenderId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OutcomeRecord" DROP COLUMN "bidAmount",
DROP COLUMN "contractSignedDate",
DROP COLUMN "contractValue",
DROP COLUMN "emdAmount",
DROP COLUMN "emdDetails",
DROP COLUMN "lostReason",
DROP COLUMN "lostTo",
DROP COLUMN "orderId",
DROP COLUMN "outcomeDate",
DROP COLUMN "remarks",
DROP COLUMN "submittedAt",
ADD COLUMN     "reasonForLoss" TEXT,
ADD COLUMN     "winner" TEXT;

-- AlterTable
ALTER TABLE "Tender" DROP COLUMN "address",
DROP COLUMN "bidValidityDays",
DROP COLUMN "biddingType",
DROP COLUMN "city",
DROP COLUMN "companySubIndustry",
DROP COLUMN "contractPeriodYears",
DROP COLUMN "country",
DROP COLUMN "customerId",
DROP COLUMN "deliveryTimelineWeeks",
DROP COLUMN "extractedCompanyName",
DROP COLUMN "extractorId",
DROP COLUMN "isFreeTender",
DROP COLUMN "keyword",
DROP COLUMN "portalSource",
DROP COLUMN "sourceUrl",
DROP COLUMN "state",
DROP COLUMN "subIndustry",
DROP COLUMN "summary",
DROP COLUMN "tcNo",
ADD COLUMN     "awardCriteria" "AwardCriteria",
ADD COLUMN     "bidValidity" TEXT,
ADD COLUMN     "bidValue" DOUBLE PRECISION,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contractPeriod" TEXT,
ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerCity" TEXT,
ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "customerState" TEXT,
ADD COLUMN     "emdAmount" DOUBLE PRECISION,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "securityDeposit" TEXT,
ADD COLUMN     "slaPenalties" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "roleId",
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "menuKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "ApprovalRecord";

-- DropTable
DROP TABLE "AwardFormalities";

-- DropTable
DROP TABLE "BidSubmission";

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "CustomerContact";

-- DropTable
DROP TABLE "DecisionMatrix";

-- DropTable
DROP TABLE "DecisionMatrixCriterion";

-- DropTable
DROP TABLE "DocumentTemplate";

-- DropTable
DROP TABLE "EmdPayment";

-- DropTable
DROP TABLE "EmdRefund";

-- DropTable
DROP TABLE "EvaluationRecord";

-- DropTable
DROP TABLE "EvaluationScore";

-- DropTable
DROP TABLE "InterestCriterion";

-- DropTable
DROP TABLE "MasterApprovalItem";

-- DropTable
DROP TABLE "MasterChecklistItem";

-- DropTable
DROP TABLE "OpportunityDetails";

-- DropTable
DROP TABLE "PqiStatement";

-- DropTable
DROP TABLE "PreliminaryTenderInfo";

-- DropTable
DROP TABLE "Role";

-- DropTable
DROP TABLE "StageApproval";

-- DropTable
DROP TABLE "TenderFeeEmdRequirement";

-- DropTable
DROP TABLE "TenderOutput";

-- DropTable
DROP TABLE "TenderQuery";

-- DropTable
DROP TABLE "TenderQueryReply";

-- DropTable
DROP TABLE "TenderUpdateChecklist";

-- DropEnum
DROP TYPE "EmdPaymentStatus";

-- DropEnum
DROP TYPE "EmdRefundReason";

-- DropEnum
DROP TYPE "EmdRefundStatus";

-- DropEnum
DROP TYPE "LostReason";

-- DropEnum
DROP TYPE "QueryStatus";

-- DropEnum
DROP TYPE "QueryVisibility";

-- CreateTable
CREATE TABLE "TenderTask" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedById" TEXT,
    "completedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "stage" "TenderStage" NOT NULL,
    "status" "TenderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TenderTask" ADD CONSTRAINT "TenderTask_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderTask" ADD CONSTRAINT "TenderTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderTask" ADD CONSTRAINT "TenderTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

