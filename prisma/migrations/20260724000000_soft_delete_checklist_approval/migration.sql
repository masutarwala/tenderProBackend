-- Soft-delete flag for TenderUpdateChecklist and StageApproval — removing a
-- user-added item must stay removed even if it matches a template item,
-- instead of being silently re-seeded by ensureDefaultChecklist/
-- ensureDefaultApprovals on the very next GET.
ALTER TABLE "TenderUpdateChecklist" ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StageApproval" ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false;
