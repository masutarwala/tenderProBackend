-- CreateTable
CREATE TABLE "StageApproval" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageApproval_tenderId_phase_roleId_key" ON "StageApproval"("tenderId", "phase", "roleId");

-- AddForeignKey
ALTER TABLE "StageApproval" ADD CONSTRAINT "StageApproval_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageApproval" ADD CONSTRAINT "StageApproval_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageApproval" ADD CONSTRAINT "StageApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
