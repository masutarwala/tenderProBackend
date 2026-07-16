-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "Tender" ADD COLUMN     "address" TEXT,
ADD COLUMN     "biddingType" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companySubIndustry" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "extractedCompanyName" TEXT,
ADD COLUMN     "isFreeTender" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "subIndustry" TEXT,
ADD COLUMN     "tcNo" TEXT,
ADD COLUMN     "tenderValue" DOUBLE PRECISION;
