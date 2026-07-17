-- CreateEnum
CREATE TYPE "TenderType" AS ENUM ('HARDWARE', 'SOFTWARE', 'SERVICES');

-- CreateEnum
CREATE TYPE "BidStage" AS ENUM ('EVALUATION', 'PREPARATION', 'SUBMISSION', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'DROPPED', 'SHORTLISTED');

-- CreateEnum
CREATE TYPE "DropReason" AS ENUM ('NOT_INTERESTED', 'NOT_QUALIFIED', 'CANCELLED_BY_CUSTOMER');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_BACK', 'REJECTED', 'BID');

-- CreateEnum
CREATE TYPE "ApprovalOverallStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT_BACK', 'REJECTED');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('WON', 'LOST');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE', 'OEM_PREFERENCE', 'TERMS_AND_CONDITIONS', 'LATE_SUBMISSION', 'TECHNICAL_DISQUALIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "EmdPaymentStatus" AS ENUM ('PENDING', 'INITIATED', 'SUBMITTED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "EmdRefundStatus" AS ENUM ('INITIATED', 'IN_PROGRESS', 'RECEIVED', 'ADJUSTED', 'RETAINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmdRefundReason" AS ENUM ('WON_NOT_REQUIRED', 'LOST_PER_TERMS', 'BID_REJECTED', 'TECHNICAL_DISQUALIFICATION', 'OTHER');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "menuKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "department" TEXT,
    "managerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryContact" TEXT,
    "alternateContact" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "industry" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationType" TEXT,
    "organizationSize" TEXT,
    "procurementNotes" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqiStatement" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "qualifications" TEXT NOT NULL,
    "technicalCapabilities" TEXT NOT NULL,
    "financialStanding" TEXT NOT NULL,
    "industryExperience" TEXT NOT NULL,
    "govtRegistrations" TEXT,
    "isoCertifications" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PqiStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestCriterion" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "industryType" TEXT,
    "geography" TEXT,
    "organizationType" TEXT,
    "organizationSizeMin" TEXT,
    "organizationSizeMax" TEXT,
    "scoringWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionMatrix" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "shortlistThreshold" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionMatrixCriterion" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "scoringScaleMax" INTEGER NOT NULL DEFAULT 10,
    "autoCalculated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DecisionMatrixCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tenderType" "TenderType",
    "storageKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" TEXT NOT NULL,
    "tenderSeq" SERIAL NOT NULL,
    "tenderRefNo" TEXT NOT NULL,
    "portalSource" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "summary" TEXT,
    "customerId" TEXT,
    "tenderType" "TenderType" NOT NULL,
    "bidStage" "BidStage" NOT NULL DEFAULT 'EVALUATION',
    "prospectStatus" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "opportunityStatus" "OpportunityStatus",
    "publishedDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "preBidDate" TIMESTAMP(3),
    "bidOpeningDate" TIMESTAMP(3),
    "bidValidityDays" INTEGER,
    "deliveryTimelineWeeks" INTEGER,
    "contractPeriodYears" INTEGER,
    "tcNo" TEXT,
    "sourceUrl" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "address" TEXT,
    "tenderValue" DOUBLE PRECISION,
    "biddingType" TEXT,
    "isFreeTender" BOOLEAN NOT NULL DEFAULT false,
    "keyword" TEXT,
    "subIndustry" TEXT,
    "companySubIndustry" TEXT,
    "extractedCompanyName" TEXT,
    "extractorId" TEXT,
    "bidderId" TEXT,
    "salesExecId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreliminaryTenderInfo" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "qualificationAssessment" BOOLEAN,
    "interestFitScore" DOUBLE PRECISION,
    "itemDetails" TEXT,
    "deliveryLocation" TEXT,
    "deliveryPeriod" TEXT,
    "paymentTermsExtracted" TEXT,
    "statutoryNotes" TEXT,
    "evaluatorNotes" TEXT,
    "shortlistRecommendation" BOOLEAN,
    "dropReason" "DropReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreliminaryTenderInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRecord" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION,
    "overrideNotes" TEXT,
    "evaluatorId" TEXT NOT NULL,
    "decisionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EvaluationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityDetails" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "requirementsBreakdown" TEXT,
    "bomJson" TEXT,
    "pricingSummaryJson" TEXT,
    "preparationPercent" INTEGER NOT NULL DEFAULT 0,
    "preparedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "financeApproved" BOOLEAN,
    "financeApproverId" TEXT,
    "financeAt" TIMESTAMP(3),
    "financeComments" TEXT,
    "salesMgrApproved" BOOLEAN,
    "salesMgrApproverId" TEXT,
    "salesMgrAt" TIMESTAMP(3),
    "salesMgrComments" TEXT,
    "ceoApproved" BOOLEAN,
    "ceoApproverId" TEXT,
    "ceoAt" TIMESTAMP(3),
    "ceoComments" TEXT,
    "overallStatus" "ApprovalOverallStatus" NOT NULL DEFAULT 'PENDING',
    "sentBackComments" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidSubmission" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedTo" TEXT,
    "submissionProofKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeRecord" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "orderId" TEXT,
    "contractValue" DOUBLE PRECISION,
    "contractSignedDate" TIMESTAMP(3),
    "lostReason" "LostReason",
    "lostTo" TEXT,
    "bidAmount" DOUBLE PRECISION,
    "winningBidAmount" DOUBLE PRECISION,
    "remarks" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderFeeEmdRequirement" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "tenderFeeRequired" BOOLEAN NOT NULL DEFAULT false,
    "tenderFeeAmount" DOUBLE PRECISION,
    "tenderFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "emdRequired" BOOLEAN NOT NULL DEFAULT false,
    "emdAmount" DOUBLE PRECISION,
    "emdPaymentMode" TEXT,
    "paymentDeadline" TIMESTAMP(3),
    "refundConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderFeeEmdRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmdPayment" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "amountRequired" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION,
    "paymentDate" TIMESTAMP(3),
    "paymentMode" TEXT,
    "paymentReference" TEXT,
    "proofStorageKey" TEXT,
    "paidById" TEXT,
    "status" "EmdPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmdPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmdRefund" (
    "id" TEXT NOT NULL,
    "emdPaymentId" TEXT NOT NULL,
    "status" "EmdRefundStatus" NOT NULL DEFAULT 'INITIATED',
    "refundAmount" DOUBLE PRECISION,
    "refundReason" "EmdRefundReason",
    "initiatedById" TEXT,
    "initiatedAt" TIMESTAMP(3),
    "expectedRefundDate" TIMESTAMP(3),
    "actualRefundDate" TIMESTAMP(3),
    "refundProofStorageKey" TEXT,
    "daysToRefund" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmdRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "diff" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderUpdateChecklist" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderUpdateChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderOutput" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "submitDate" TIMESTAMP(3),
    "submitValue" DOUBLE PRECISION,
    "outcome" TEXT,
    "outcomeRemarks" TEXT,
    "winningBidValue" DOUBLE PRECISION,
    "winner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenderOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterChecklistItem" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_tenderSeq_key" ON "Tender"("tenderSeq");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_tenderRefNo_key" ON "Tender"("tenderRefNo");

-- CreateIndex
CREATE UNIQUE INDEX "PreliminaryTenderInfo_tenderId_key" ON "PreliminaryTenderInfo"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityDetails_tenderId_key" ON "OpportunityDetails"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRecord_opportunityId_key" ON "ApprovalRecord"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "BidSubmission_opportunityId_key" ON "BidSubmission"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeRecord_tenderId_key" ON "OutcomeRecord"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderFeeEmdRequirement_tenderId_key" ON "TenderFeeEmdRequirement"("tenderId");

-- CreateIndex
CREATE UNIQUE INDEX "EmdPayment_requirementId_key" ON "EmdPayment"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "EmdRefund_emdPaymentId_key" ON "EmdRefund"("emdPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TenderOutput_tenderId_key" ON "TenderOutput"("tenderId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionMatrixCriterion" ADD CONSTRAINT "DecisionMatrixCriterion_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "DecisionMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_extractorId_fkey" FOREIGN KEY ("extractorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_salesExecId_fkey" FOREIGN KEY ("salesExecId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreliminaryTenderInfo" ADD CONSTRAINT "PreliminaryTenderInfo_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecord" ADD CONSTRAINT "EvaluationRecord_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecord" ADD CONSTRAINT "EvaluationRecord_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "DecisionMatrix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRecord" ADD CONSTRAINT "EvaluationRecord_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "EvaluationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "DecisionMatrixCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDetails" ADD CONSTRAINT "OpportunityDetails_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "OpportunityDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidSubmission" ADD CONSTRAINT "BidSubmission_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "OpportunityDetails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeRecord" ADD CONSTRAINT "OutcomeRecord_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderFeeEmdRequirement" ADD CONSTRAINT "TenderFeeEmdRequirement_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmdPayment" ADD CONSTRAINT "EmdPayment_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "TenderFeeEmdRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmdPayment" ADD CONSTRAINT "EmdPayment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmdRefund" ADD CONSTRAINT "EmdRefund_emdPaymentId_fkey" FOREIGN KEY ("emdPaymentId") REFERENCES "EmdPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmdRefund" ADD CONSTRAINT "EmdRefund_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderUpdateChecklist" ADD CONSTRAINT "TenderUpdateChecklist_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderUpdateChecklist" ADD CONSTRAINT "TenderUpdateChecklist_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderOutput" ADD CONSTRAINT "TenderOutput_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

