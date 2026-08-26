-- AlterTable: documents are now URL links, not uploaded files — fileName and
-- publicId are no longer required going forward (legacy rows keep theirs).
ALTER TABLE "Document" ALTER COLUMN "fileName" DROP NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "publicId" DROP NOT NULL;
