import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { tryAdvanceFromEvaluation, tryAdvanceFromPreparation } from "../../utils/evaluationGate";
import { isPhaseLocked } from "../../utils/phaseLock";

const router = Router();
router.use(authenticate);

const PHASES = ["EVALUATION", "PREPARATION"] as const;

// BIDDER can see/manage every approval row; everyone else only sees (and can
// only approve) rows matching their own role — role-based approvals shouldn't
// leak to people who aren't the approver.
const MANAGE_ROLES = ["BIDDER"];

const approvalInclude = {
  role: { select: { id: true, name: true } },
  approvedBy: { select: { fullName: true, role: { select: { name: true } } } },
};

// Once a phase is actually completed (tender moved past it), its approvals become
// a closed record — no more adding, editing, approving, or removing. Mirrors the
// frontend's phaseLocked/tabIsComplete logic in TenderUpdatePage.tsx.
async function assertPhaseUnlocked(tenderId: string, phase: string) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { stage: true } });
  if (!tender) throw new HttpError(404, "Tender not found");
  if (isPhaseLocked(tender.stage, phase as "EVALUATION" | "PREPARATION")) {
    throw new HttpError(400, "This stage is complete — approvals are locked.");
  }
}

// Seeds a tender's approvals from the admin/bidder-authored MasterApprovalItem
// template (EVALUATION/PREPARATION only). Purely additive, keyed by
// phase+title+role, so ad-hoc approvals added to just one tender (not saved to
// the template) are never touched — mirrors ensureDefaultChecklist in
// evaluation.routes.ts.
async function ensureDefaultApprovals(tenderId: string) {
  const templateItems = await prisma.masterApprovalItem.findMany({
    where: { phase: { in: ["EVALUATION", "PREPARATION"] }, isDefault: true },
  });
  if (templateItems.length === 0) return;

  // Includes soft-removed rows — a user who explicitly removed a default
  // approval shouldn't have it silently reappear on the next fetch.
  const existing = await prisma.stageApproval.findMany({ where: { tenderId } });
  const existingKey = new Set(existing.map((e) => `${e.phase}:${e.title}:${e.roleId}`));
  const missing = templateItems.filter((t) => !existingKey.has(`${t.phase}:${t.title}:${t.roleId}`));
  if (missing.length > 0) {
    await prisma.stageApproval.createMany({
      data: missing.map((t) => ({ tenderId, phase: t.phase, title: t.title, roleId: t.roleId, required: t.required })),
    });
  }
}

router.get(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await ensureDefaultApprovals(req.params.tenderId);
    const rows = await prisma.stageApproval.findMany({
      where: { tenderId: req.params.tenderId, removed: false },
      include: approvalInclude,
      orderBy: { createdAt: "asc" },
    });
    const visible = MANAGE_ROLES.includes(req.user!.role) ? rows : rows.filter((r) => r.role.name === req.user!.role);
    res.json(visible);
  })
);

const addSchema = z.object({
  phase: z.enum(PHASES),
  title: z.string().min(1),
  roleId: z.string(),
  required: z.boolean().optional(),
  addToTemplate: z.boolean().optional(),
});

// A role can hold multiple distinct approvals per phase (e.g. Sales Manager
// asked for both "Technical Clearance" and "Budget Sign-off"). When
// addToTemplate is set, this also saves the approval into the
// MasterApprovalItem template (Administration → Approvals) so future tenders
// get it automatically — same "save as default?" idea as custom checklist items.
router.post(
  "/:tenderId",
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = addSchema.parse(req.body);
    await assertPhaseUnlocked(req.params.tenderId, data.phase);

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.stageApproval.create({
        data: { tenderId: req.params.tenderId, phase: data.phase, title: data.title, roleId: data.roleId, required: data.required ?? true },
        include: approvalInclude,
      });

      if (data.addToTemplate) {
        const existingTemplate = await tx.masterApprovalItem.findFirst({
          where: { phase: data.phase, title: data.title, roleId: data.roleId },
        });
        if (!existingTemplate) {
          await tx.masterApprovalItem.create({
            data: { phase: data.phase, title: data.title, roleId: data.roleId, required: data.required ?? true, isDefault: true },
          });
        }
      }

      return created;
    });

    await recordAudit(req, "CREATE", "StageApproval", row.id, data);
    res.status(201).json(row);
  })
);

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  required: z.boolean().optional(),
});

router.patch(
  "/:tenderId/:approvalId",
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    const row = await prisma.stageApproval.findUnique({ where: { id: req.params.approvalId } });
    if (!row || row.tenderId !== req.params.tenderId) throw new HttpError(404, "Approval row not found");
    await assertPhaseUnlocked(req.params.tenderId, row.phase);

    const updated = await prisma.stageApproval.update({
      where: { id: row.id },
      data,
      include: approvalInclude,
    });
    await recordAudit(req, "UPDATE", "StageApproval", updated.id, data);
    res.json(updated);
  })
);

// Only a user holding the row's role (or BIDDER) may approve it — the whole
// point of a role-based sign-off is that it isn't self-service.
router.post(
  "/:tenderId/:approvalId/approve",
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await prisma.stageApproval.findUnique({ where: { id: req.params.approvalId }, include: approvalInclude });
    if (!row || row.tenderId !== req.params.tenderId) throw new HttpError(404, "Approval row not found");
    if (!MANAGE_ROLES.includes(req.user!.role) && req.user!.role !== row.role.name) {
      throw new HttpError(403, `Only a ${row.role.name.replace(/_/g, " ")} (or Bidder) can give this approval`);
    }
    await assertPhaseUnlocked(req.params.tenderId, row.phase);

    const updated = await prisma.stageApproval.update({
      where: { id: row.id },
      data: { approved: true, approvedAt: new Date(), approvedById: req.user!.userId },
      include: approvalInclude,
    });
    await recordAudit(req, "UPDATE", "StageApproval", updated.id, { approved: true });

    if (row.phase === "EVALUATION") {
      await tryAdvanceFromEvaluation(req.params.tenderId);
    } else if (row.phase === "PREPARATION") {
      await tryAdvanceFromPreparation(req.params.tenderId);
    }

    res.json(updated);
  })
);

router.delete(
  "/:tenderId/:approvalId",
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const row = await prisma.stageApproval.findUnique({ where: { id: req.params.approvalId } });
    if (!row || row.tenderId !== req.params.tenderId) throw new HttpError(404, "Approval row not found");
    await assertPhaseUnlocked(req.params.tenderId, row.phase);
    await prisma.stageApproval.update({ where: { id: row.id }, data: { removed: true } });
    await recordAudit(req, "DELETE", "StageApproval", row.id);
    res.status(204).send();
  })
);

export default router;
