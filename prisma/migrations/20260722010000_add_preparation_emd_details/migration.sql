-- CreateTable
CREATE TABLE "PreparationEmdDetails" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "emdAmount" DOUBLE PRECISION,
    "bidderRegistrationNo" TEXT,
    "utrNumber" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparationEmdDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreparationEmdDetails_tenderId_key" ON "PreparationEmdDetails"("tenderId");

-- AddForeignKey
ALTER TABLE "PreparationEmdDetails" ADD CONSTRAINT "PreparationEmdDetails_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparationEmdDetails" ADD CONSTRAINT "PreparationEmdDetails_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
