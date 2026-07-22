-- CreateEnum
CREATE TYPE "QueryVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "TenderQuery" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "visibility" "QueryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "targetRoleId" TEXT,
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenderQueryReply" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenderQueryReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenderQuery_tenderId_phase_idx" ON "TenderQuery"("tenderId", "phase");

-- AddForeignKey
ALTER TABLE "TenderQuery" ADD CONSTRAINT "TenderQuery_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderQuery" ADD CONSTRAINT "TenderQuery_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderQuery" ADD CONSTRAINT "TenderQuery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderQueryReply" ADD CONSTRAINT "TenderQueryReply_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "TenderQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenderQueryReply" ADD CONSTRAINT "TenderQueryReply_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
