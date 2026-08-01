-- Existing Document rows point at local-disk storageKeys from the old
-- upload path; there's no Cloudinary URL to backfill them with, so they're
-- dropped rather than left half-migrated (dev data only).
DELETE FROM "Document";

ALTER TABLE "Document" DROP COLUMN "storageKey",
ADD COLUMN     "publicId" TEXT NOT NULL,
ADD COLUMN     "resourceType" TEXT,
ADD COLUMN     "url" TEXT NOT NULL;
