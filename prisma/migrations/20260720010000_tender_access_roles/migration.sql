-- AlterTable
ALTER TABLE "Tender" ADD COLUMN "accessRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
