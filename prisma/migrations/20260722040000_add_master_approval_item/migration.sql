-- CreateTable
CREATE TABLE "MasterApprovalItem" (
    "id" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterApprovalItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MasterApprovalItem" ADD CONSTRAINT "MasterApprovalItem_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
