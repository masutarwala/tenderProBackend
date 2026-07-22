-- CreateTable
CREATE TABLE "AwardFormalities" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "contractSigned" BOOLEAN NOT NULL DEFAULT false,
    "contractSignedDate" TIMESTAMP(3),
    "poReceived" BOOLEAN NOT NULL DEFAULT false,
    "poNumber" TEXT,
    "poDate" TIMESTAMP(3),
    "poValue" DOUBLE PRECISION,
    "bgRequired" BOOLEAN NOT NULL DEFAULT false,
    "bgIssued" BOOLEAN NOT NULL DEFAULT false,
    "bgAmount" DOUBLE PRECISION,
    "bgBankName" TEXT,
    "bgValidityDate" TIMESTAMP(3),
    "formalitiesComplete" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardFormalities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardFormalities_tenderId_key" ON "AwardFormalities"("tenderId");

-- AddForeignKey
ALTER TABLE "AwardFormalities" ADD CONSTRAINT "AwardFormalities_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardFormalities" ADD CONSTRAINT "AwardFormalities_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
