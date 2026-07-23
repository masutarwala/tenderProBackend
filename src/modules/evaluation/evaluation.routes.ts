import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { isEvaluationGatePassed, tryAdvanceFromEvaluation, isPreparationGatePassed, tryAdvanceFromPreparation } from "../../utils/evaluationGate";

const router = Router();
router.use(authenticate);

// ============================================
// DECISION MATRIX EVALUATION ENDPOINTS (Prospect-stage shortlist scoring, spec §4.2)
// Used by TenderDetailPage's ProspectSection — unrelated to the checklist/output
// endpoints below, kept as-is.
// ============================================
const scoreSchema = z.object({
  matrixId: z.string(),
  scores: z.array(z.object({ criterionId: z.string(), score: z.number().min(0) })),
  overrideNotes: z.string().optional(),
});

router.get(
  "/:tenderId/matrix-evaluation",
  requireRole("EVALUATOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.evaluationRecord.findMany({
        where: { tenderId: req.params.tenderId },
        include: { scores: { include: { criterion: true } }, matrix: true },
        orderBy: { createdAt: "desc" },
      })
    );
  })
);

router.post(
  "/:tenderId/matrix-evaluation",
  requireRole("EVALUATOR", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = scoreSchema.parse(req.body);
    const matrix = await prisma.decisionMatrix.findUnique({ where: { id: data.matrixId }, include: { criteria: true } });
    if (!matrix) throw new HttpError(404, "Decision matrix not found");

    let weightedTotal = 0;
    for (const criterion of matrix.criteria) {
      const scoreEntry = data.scores.find((s) => s.criterionId === criterion.id);
      if (!scoreEntry) continue;
      const normalized = scoreEntry.score / criterion.scoringScaleMax;
      weightedTotal += normalized * criterion.weight;
    }

    const record = await prisma.evaluationRecord.create({
      data: {
        tenderId: req.params.tenderId,
        matrixId: data.matrixId,
        evaluatorId: req.user!.userId,
        totalScore: weightedTotal,
        overrideNotes: data.overrideNotes,
        decisionAt: new Date(),
        scores: { create: data.scores.map((s) => ({ criterionId: s.criterionId, score: s.score })) },
      },
      include: { scores: true },
    });

    await recordAudit(req, "CREATE", "EvaluationRecord", record.id, { totalScore: weightedTotal });
    res.status(201).json({ ...record, recommendedShortlist: weightedTotal >= matrix.shortlistThreshold });
  })
);

// Kept for compatibility with existing frontend calls to plain GET/POST /:tenderId
// (TenderDetailPage's evaluationApi.score hits this).
router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.evaluationRecord.findMany({
        where: { tenderId: req.params.tenderId },
        include: { scores: { include: { criterion: true } }, matrix: true },
        orderBy: { createdAt: "desc" },
      })
    );
  })
);

router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!["EVALUATOR", "ADMIN"].includes(req.user!.role)) {
      throw new HttpError(403, "Forbidden");
    }
    const data = scoreSchema.parse(req.body);
    const matrix = await prisma.decisionMatrix.findUnique({ where: { id: data.matrixId }, include: { criteria: true } });
    if (!matrix) throw new HttpError(404, "Decision matrix not found");

    let weightedTotal = 0;
    for (const criterion of matrix.criteria) {
      const scoreEntry = data.scores.find((s) => s.criterionId === criterion.id);
      if (!scoreEntry) continue;
      const normalized = scoreEntry.score / criterion.scoringScaleMax;
      weightedTotal += normalized * criterion.weight;
    }

    const record = await prisma.evaluationRecord.create({
      data: {
        tenderId: req.params.tenderId,
        matrixId: data.matrixId,
        evaluatorId: req.user!.userId,
        totalScore: weightedTotal,
        overrideNotes: data.overrideNotes,
        decisionAt: new Date(),
        scores: { create: data.scores.map((s) => ({ criterionId: s.criterionId, score: s.score })) },
      },
      include: { scores: true },
    });

    await recordAudit(req, "CREATE", "EvaluationRecord", record.id, { totalScore: weightedTotal });
    res.status(201).json({ ...record, recommendedShortlist: weightedTotal >= matrix.shortlistThreshold });
  })
);

// ============================================
// TENDER UPDATE PAGE: CHECKLIST + OUTPUT
// ============================================

// Static bid lifecycle checklist — 3 phase groups matching stage 1:1
// (EVALUATION/PREPARATION/SUBMISSION; completing the last SUBMISSION task closes
// the tender). Not user-editable — no add/remove/reorder. Each row can carry a
// per-tender `assignedRoleId` (see PUT handler) for "who owns this task".
export const CHECKLIST_DEFINITION: { phase: string; order: number; label: string }[] = [
  // Static, always-first: the Go/No-Go call for this tender. Rendered specially
  // (dropdown + remarks + submit, not a checkbox) — see the /decision endpoint
  // below. The other 7 EVALUATION items are informational and don't gate the
  // stage transition; only this row (+ required approvals) does.
  { phase: "EVALUATION", order: 0, label: "Go/No-Go Decision" },
  { phase: "EVALUATION", order: 1, label: "Review Tender Document" },
  { phase: "EVALUATION", order: 2, label: "Evaluate Eligibility" },
  { phase: "EVALUATION", order: 3, label: "Risk Analysis" },
  { phase: "EVALUATION", order: 4, label: "Prepare Technical Queries" },
  { phase: "EVALUATION", order: 5, label: "Prepare Commercial Queries" },
  { phase: "EVALUATION", order: 6, label: "Attend Pre-Bid Meeting" },
  { phase: "EVALUATION", order: 7, label: "Seek Deviations" },

  // Static, always-first: the submit call for Preparation. Rendered specially
  // (submit + remarks, not a checkbox) — see the /submit endpoint below. Once
  // checked + all required PREPARATION approvals are in, advances to Submission.
  { phase: "PREPARATION", order: 0, label: "Preparation Done" },
  { phase: "PREPARATION", order: 1, label: "Checklist Preparation" },
  { phase: "PREPARATION", order: 2, label: "OEM/Partner Coordination" },
  { phase: "PREPARATION", order: 3, label: "Quote" },
  { phase: "PREPARATION", order: 4, label: "Document Collation" },
  { phase: "PREPARATION", order: 5, label: "Technicals" },
  { phase: "PREPARATION", order: 6, label: "Drafting" },
  { phase: "PREPARATION", order: 7, label: "Financial Risk Assessment" },
  { phase: "PREPARATION", order: 8, label: "Management Buy in" },

  { phase: "SUBMISSION", order: 0, label: "EMD Prepared" },
  { phase: "SUBMISSION", order: 1, label: "Final Prepared" },
  { phase: "SUBMISSION", order: 2, label: "Quality Review Completed" },
  { phase: "SUBMISSION", order: 3, label: "Submitted" },
];

const CHECKLIST_PHASES = ["EVALUATION", "PREPARATION", "SUBMISSION"] as const;

// A stage's status is COMPLETED once every task in that phase is checked, else
// PENDING. Exported for reuse by tenders.routes.ts (list/detail stageProgress).
export function computeStageProgress(stage: string, status: string, checklistItems: { phase: string; checked: boolean }[]) {
  const rows = checklistItems.filter((i) => i.phase === stage);
  const completed = rows.filter((i) => i.checked).length;
  const total = rows.length;
  return { completed, total, status: status === "COMPLETED" ? ("COMPLETED" as const) : ("PENDING" as const) };
}

// Seeds a tender's checklist from two sources: the fixed CHECKLIST_DEFINITION
// (always present, every tender) and any admin/bidder-authored template items
// (MasterChecklistItem, EVALUATION/PREPARATION only — see the /items endpoints
// below). Purely additive: never deletes a row, so ad-hoc items added to just
// one tender (not saved to the template) persist safely too.
export async function ensureDefaultChecklist(tenderId: string) {
  const templateItems = await prisma.masterChecklistItem.findMany({
    where: { phase: { in: ["EVALUATION", "PREPARATION"] }, isDefault: true },
  });
  const toSeed = [
    ...CHECKLIST_DEFINITION,
    ...templateItems.map((t) => ({ phase: t.phase, label: t.label, order: t.order + 100 })),
  ];

  // Includes soft-removed rows — a user who explicitly removed a custom/
  // template item shouldn't have it silently reappear on the next fetch.
  const existing = await prisma.tenderUpdateChecklist.findMany({ where: { tenderId } });
  const existingKey = new Set(existing.map((e) => `${e.phase}:${e.label}`));
  const missing = toSeed.filter((item) => !existingKey.has(`${item.phase}:${item.label}`));
  if (missing.length > 0) {
    await prisma.tenderUpdateChecklist.createMany({
      data: missing.map((item) => ({ tenderId, phase: item.phase, label: item.label, order: item.order })),
    });
  }
}

const checklistInclude = {
  updatedBy: { select: { fullName: true, role: { select: { name: true } } } },
  assignedRole: { select: { id: true, name: true } },
};

async function assertTenderAccess(req: AuthedRequest, tenderId: string) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { id: true } });
  if (!tender) throw new HttpError(404, "Tender not found");
}

router.get(
  "/:tenderId/checklist",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    await ensureDefaultChecklist(req.params.tenderId);
    const items = await prisma.tenderUpdateChecklist.findMany({
      where: { tenderId: req.params.tenderId, removed: false },
      include: checklistInclude,
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });
    res.json(items);
  })
);

const checklistSaveSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      phase: z.enum(CHECKLIST_PHASES),
      checked: z.boolean(),
      assignedRoleId: z.string().nullable().optional(),
    })
  ),
});

// The checklist structure (labels/phases/order) is fixed by CHECKLIST_DEFINITION —
// this only ever toggles `checked`/`assignedRoleId` on existing rows, never
// creates/reorders/relabels. `updatedById` is only stamped on rows whose
// `checked` value actually changed. Each phase maps 1:1 to a stage value —
// completing the last SUBMISSION task closes the tender.
router.put(
  "/:tenderId/checklist",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    const data = checklistSaveSchema.parse(req.body);
    // Excludes removed rows — a removed, unchecked item must not block phase
    // completion below ("every item checked" would otherwise never be true).
    const existing = await prisma.tenderUpdateChecklist.findMany({ where: { tenderId: req.params.tenderId, removed: false } });
    const existingById = new Map(existing.map((e) => [e.id, e]));

    // Merge incoming toggles onto the known checklist rows to evaluate group completion.
    const checkedByItemId = new Map(data.items.map((i) => [i.id, i.checked]));
    const merged = existing.map((e) => ({ ...e, checked: checkedByItemId.get(e.id) ?? e.checked }));
    const phaseComplete = (phase: string) => {
      const rows = merged.filter((r) => r.phase === phase);
      return rows.length > 0 && rows.every((r) => r.checked);
    };

    // EVALUATION's and PREPARATION's own gates are their static submit item +
    // required approvals (see evaluationGate.ts), not "every item checked".
    let nextStage: "EVALUATION" | "PREPARATION" | "SUBMISSION";
    let nextStatus: "PENDING" | "COMPLETED" = "PENDING";
    if (phaseComplete("SUBMISSION")) {
      nextStage = "SUBMISSION";
      nextStatus = "COMPLETED";
    } else if (await isPreparationGatePassed(req.params.tenderId)) {
      nextStage = "SUBMISSION";
    } else if (await isEvaluationGatePassed(req.params.tenderId)) {
      nextStage = "PREPARATION";
    } else {
      nextStage = "EVALUATION";
    }

    await prisma.$transaction([
      ...data.items.map((item) => {
        const prior = existingById.get(item.id);
        const checkedChanged = !!prior && prior.checked !== item.checked;
        return prisma.tenderUpdateChecklist.update({
          where: { id: item.id },
          data: {
            checked: item.checked,
            ...(item.assignedRoleId !== undefined ? { assignedRoleId: item.assignedRoleId } : {}),
            ...(checkedChanged ? { updatedById: req.user!.userId } : {}),
          },
        });
      }),
      prisma.tender.update({
        where: { id: req.params.tenderId },
        data: { stage: nextStage, status: nextStatus },
      }),
    ]);
    await recordAudit(req, "UPDATE", "TenderUpdateChecklist", req.params.tenderId);
    const items = await prisma.tenderUpdateChecklist.findMany({
      where: { tenderId: req.params.tenderId, removed: false },
      include: checklistInclude,
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });
    res.json(items);
  })
);

const decisionSchema = z.object({
  decision: z.enum(["GO", "NO_GO"]),
  remarks: z.string().trim().min(1, "Remarks are required"),
});

// Submits the static "Go/No-Go Decision" row — separate from the bulk checklist
// save since it carries extra fields (decision/remarks) and can, on its own,
// advance the tender past EVALUATION once required approvals are also in.
router.put(
  "/:tenderId/checklist/:itemId/decision",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    const data = decisionSchema.parse(req.body);
    const item = await prisma.tenderUpdateChecklist.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.tenderId !== req.params.tenderId || item.label !== "Go/No-Go Decision") {
      throw new HttpError(404, "Go/No-Go decision item not found");
    }

    const updated = await prisma.tenderUpdateChecklist.update({
      where: { id: item.id },
      data: { checked: true, decision: data.decision, remarks: data.remarks ?? null, updatedById: req.user!.userId },
      include: checklistInclude,
    });

    if (data.decision === "GO") {
      await tryAdvanceFromEvaluation(req.params.tenderId);
    } else {
      // No-Go closes the tender right here, still at Evaluation — it never
      // reaches Preparation/Submission — so it needs its own outcome record
      // for the Award page (filterable as "No-Go", distinct from a
      // Submission-stage Win/Lost).
      await prisma.tender.update({ where: { id: req.params.tenderId }, data: { stage: "EVALUATION", status: "COMPLETED" } });
      await prisma.outcomeRecord.upsert({
        where: { tenderId: req.params.tenderId },
        update: { outcome: "NO_GO", remarks: data.remarks, recordedById: req.user!.userId },
        create: { tenderId: req.params.tenderId, outcome: "NO_GO", remarks: data.remarks, recordedById: req.user!.userId },
      });
    }

    await recordAudit(req, "UPDATE", "TenderUpdateChecklist", updated.id, data);
    // Return the resulting stage/status alongside the item so the frontend
    // doesn't need a second round-trip (a plain GET /tenders/:id) just to
    // learn whether this submission advanced the tender's stage.
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, select: { stage: true, status: true } });
    res.json({ item: updated, stage: tender!.stage, status: tender!.status });
  })
);

const submitSchema = z.object({
  remarks: z.string().trim().min(1, "Remarks are required"),
});

// Submits the static "Preparation Done" row — mirrors /decision above but
// for PREPARATION (no Go/No-Go choice, just a single confirm action).
router.put(
  "/:tenderId/checklist/:itemId/submit",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    const data = submitSchema.parse(req.body);
    const item = await prisma.tenderUpdateChecklist.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.tenderId !== req.params.tenderId || item.label !== "Preparation Done") {
      throw new HttpError(404, "Preparation Done item not found");
    }

    const updated = await prisma.tenderUpdateChecklist.update({
      where: { id: item.id },
      data: { checked: true, remarks: data.remarks ?? null, updatedById: req.user!.userId },
      include: checklistInclude,
    });

    await tryAdvanceFromPreparation(req.params.tenderId);

    await recordAudit(req, "UPDATE", "TenderUpdateChecklist", updated.id, data);
    // See the /decision endpoint above for why stage/status is returned here too.
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, select: { stage: true, status: true } });
    res.json({ item: updated, stage: tender!.stage, status: tender!.status });
  })
);

// ============================================
// CHECKLIST ITEM MANAGEMENT (BIDDER only, EVALUATION & PREPARATION only) —
// the two static gate rows (Go/No-Go Decision, Preparation Done) can't be
// added/removed/renamed since the stage-transition logic keys off their exact
// label.
// ============================================

const MANAGE_ROLES = ["BIDDER"];
const PROTECTED_LABELS = ["Go/No-Go Decision", "Preparation Done"];
const ITEM_MANAGE_PHASES = ["EVALUATION", "PREPARATION"] as const;

const addItemSchema = z.object({
  phase: z.enum(ITEM_MANAGE_PHASES),
  label: z.string().min(1),
  addToTemplate: z.boolean().optional(),
});

router.post(
  "/:tenderId/checklist/items",
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    const data = addItemSchema.parse(req.body);

    const item = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.tenderUpdateChecklist.aggregate({
        where: { tenderId: req.params.tenderId, phase: data.phase },
        _max: { order: true },
      });
      const created = await tx.tenderUpdateChecklist.create({
        data: { tenderId: req.params.tenderId, phase: data.phase, label: data.label, order: (maxOrder._max.order ?? -1) + 1 },
        include: checklistInclude,
      });

      if (data.addToTemplate) {
        const existingTemplate = await tx.masterChecklistItem.findFirst({ where: { phase: data.phase, label: data.label } });
        if (!existingTemplate) {
          const maxTemplateOrder = await tx.masterChecklistItem.aggregate({ where: { phase: data.phase }, _max: { order: true } });
          await tx.masterChecklistItem.create({
            data: { phase: data.phase, label: data.label, order: (maxTemplateOrder._max.order ?? -1) + 1, isDefault: true },
          });
        }
      }

      return created;
    });

    await recordAudit(req, "CREATE", "TenderUpdateChecklist", item.id, data);
    res.status(201).json(item);
  })
);

router.delete(
  "/:tenderId/checklist/items/:itemId",
  requireRole(...MANAGE_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderAccess(req, req.params.tenderId);
    const item = await prisma.tenderUpdateChecklist.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.tenderId !== req.params.tenderId) throw new HttpError(404, "Checklist item not found");
    if (!ITEM_MANAGE_PHASES.includes(item.phase as any)) throw new HttpError(400, "Only Evaluation/Preparation items can be removed");
    if (PROTECTED_LABELS.includes(item.label)) throw new HttpError(400, "This item can't be removed");

    await prisma.tenderUpdateChecklist.update({ where: { id: item.id }, data: { removed: true } });
    await recordAudit(req, "DELETE", "TenderUpdateChecklist", item.id);
    res.status(204).send();
  })
);

router.get(
  "/:tenderId/output",
  asyncHandler(async (req, res) => {
    res.json(await prisma.tenderOutput.findUnique({ where: { tenderId: req.params.tenderId } }));
  })
);

const outputSchema = z.object({
  submitDate: z.coerce.date().nullable().optional(),
  submitValue: z.number().nullable().optional(),
  outcome: z.enum(["WIN", "LOST", "OTHER"]).nullable().optional(),
  outcomeRemarks: z.string().nullable().optional(),
  winningBidValue: z.number().nullable().optional(),
  winner: z.string().nullable().optional(),
});

router.put(
  "/:tenderId/output",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = outputSchema.parse(req.body);
    const record = await prisma.tenderOutput.upsert({
      where: { tenderId: req.params.tenderId },
      update: data,
      create: { tenderId: req.params.tenderId, ...data },
    });
    await recordAudit(req, "UPDATE", "TenderOutput", record.id, data);
    res.json(record);
  })
);

export default router;
