-- Drop the unused Contact Platform field from Tender
ALTER TABLE "Tender" DROP COLUMN "contactPlatform";

-- Add an auto-incrementing internal counter used to derive the "TENDER001" style
-- display ID (see formatTenderId() in tenders.routes.ts). Existing rows are
-- numbered automatically by Postgres in insertion order.
CREATE SEQUENCE IF NOT EXISTS "Tender_tenderSeq_seq";
ALTER TABLE "Tender" ADD COLUMN "tenderSeq" INTEGER NOT NULL DEFAULT nextval('"Tender_tenderSeq_seq"');
ALTER SEQUENCE "Tender_tenderSeq_seq" OWNED BY "Tender"."tenderSeq";
CREATE UNIQUE INDEX "Tender_tenderSeq_key" ON "Tender"("tenderSeq");

-- Customer.industry becomes a string array (chips UI) — existing single values
-- cannot be safely auto-cast to arrays, so this is a dev-data-loss column swap
-- consistent with prior migrations in this project.
ALTER TABLE "Customer" DROP COLUMN "industry";
ALTER TABLE "Customer" ADD COLUMN "industry" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
