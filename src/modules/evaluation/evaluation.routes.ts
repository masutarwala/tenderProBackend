import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

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

const DEFAULT_EVALUATION_STEPS = [
  "Tender document review",
  "Technical feasibility assessment",
  "Compliance check (eligibility & EMD)",
  "Financial analysis",
  "Risk assessment",
  "Go/No-Go decision",
];

const DEFAULT_PREPARATION_STEPS = [
  "NIT / RFP download",
  "Pre-bid queries submission",
  "Technical document preparation",
  "Financial bid preparation",
  "EMD arrangement",
  "Document compilation & review",
  "Submission",
];

async function ensureDefaultChecklist(tenderId: string) {
  const staticItems = [
    { phase: "EVALUATION", label: "Shortlist for preparation", order: -100 },
    { phase: "SUBMISSION", label: "Submission", order: -100 },
    { phase: "SUBMISSION", label: "Technical round", order: -99 },
    { phase: "SUBMISSION", label: "Commercial round", order: -98 },
    { phase: "OUTCOME", label: "Decision made", order: -100 },
  ];

  for (const item of staticItems) {
    const found = await prisma.tenderUpdateChecklist.findFirst({
      where: { tenderId, phase: item.phase, label: item.label },
    });
    if (!found) {
      await prisma.tenderUpdateChecklist.create({
        data: {
          tenderId,
          phase: item.phase,
          label: item.label,
          order: item.order,
        },
      });
    }
  }

  const existingNonStaticCount = await prisma.tenderUpdateChecklist.count({
    where: {
      tenderId,
      NOT: {
        label: { in: staticItems.map((s) => s.label) },
      },
    },
  });

  if (existingNonStaticCount === 0) {
    const defaultItems = await prisma.masterChecklistItem.findMany({
      where: { isDefault: true },
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });

    const rows = defaultItems.map((item) => ({
      tenderId,
      phase: item.phase,
      label: item.label,
      order: item.order,
    }));

    if (rows.length > 0) {
      await prisma.tenderUpdateChecklist.createMany({ data: rows });
    }
  }
}

const checklistInclude = { updatedBy: { select: { fullName: true, role: { select: { name: true } } } } };

router.get(
  "/:tenderId/checklist",
  asyncHandler(async (req, res) => {
    await ensureDefaultChecklist(req.params.tenderId);
    const items = await prisma.tenderUpdateChecklist.findMany({
      where: { tenderId: req.params.tenderId },
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
      phase: z.enum(["EVALUATION", "PREPARATION", "SUBMISSION", "OUTCOME"]),
      label: z.string().min(1),
      order: z.number().int(),
      checked: z.boolean(),
      remarks: z.string().nullable().optional(),
    })
  ),
});

// Full replace: the Update page sends its whole in-memory checklist (both phases)
// on every check/uncheck and every reorder, so this just upserts each row by id.
// `updatedById` is only stamped on rows whose `checked` value actually changed —
// reordering or relabeling doesn't touch who last checked/unchecked an item.
router.put(
  "/:tenderId/checklist",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = checklistSaveSchema.parse(req.body);
    const existing = await prisma.tenderUpdateChecklist.findMany({ where: { tenderId: req.params.tenderId } });
    const existingById = new Map(existing.map((e) => [e.id, e]));

    const shortlistChecked = data.items.some((i) => i.label === "Shortlist for preparation" && i.checked);
    const submissionChecked = data.items.some((i) => i.label === "Submission" && i.checked);
    const decisionMadeChecked = data.items.some((i) => i.label === "Decision made" && i.checked);

    let nextBidStage: "EVALUATION" | "PREPARATION" | "SUBMISSION" | "CLOSED";
    if (decisionMadeChecked) {
      nextBidStage = "CLOSED";
    } else if (submissionChecked) {
      nextBidStage = "SUBMISSION";
    } else if (shortlistChecked) {
      nextBidStage = "PREPARATION";
    } else {
      nextBidStage = "EVALUATION";
    }

    await prisma.$transaction([
      ...data.items.map((item) => {
        const prior = existingById.get(item.id);
        const checkedChanged = !!prior && prior.checked !== item.checked;
        return prisma.tenderUpdateChecklist.update({
          where: { id: item.id },
          data: {
            phase: item.phase,
            label: item.label,
            order: item.order,
            checked: item.checked,
            remarks: item.remarks,
            ...(checkedChanged ? { updatedById: req.user!.userId } : {}),
          },
        });
      }),
      prisma.tender.update({
        where: { id: req.params.tenderId },
        data: { bidStage: nextBidStage },
      }),
    ]);
    await recordAudit(req, "UPDATE", "TenderUpdateChecklist", req.params.tenderId);
    const items = await prisma.tenderUpdateChecklist.findMany({
      where: { tenderId: req.params.tenderId },
      include: checklistInclude,
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });
    res.json(items);
  })
);

const addChecklistItemSchema = z.object({
  phase: z.enum(["EVALUATION", "PREPARATION", "SUBMISSION", "OUTCOME"]),
  label: z.string().min(1),
  addToDefault: z.boolean().optional(),
});

router.post(
  "/:tenderId/checklist",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = addChecklistItemSchema.parse(req.body);
    
    const item = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.tenderUpdateChecklist.aggregate({
        where: { tenderId: req.params.tenderId, phase: data.phase },
        _max: { order: true },
      });
      const order = (maxOrder._max.order ?? -1) + 1;

      const created = await tx.tenderUpdateChecklist.create({
        data: {
          tenderId: req.params.tenderId,
          phase: data.phase,
          label: data.label,
          order,
          checked: false,
        },
        include: checklistInclude,
      });

      if (data.addToDefault && req.user!.role === "ADMIN") {
        const masterMax = await tx.masterChecklistItem.aggregate({
          where: { phase: data.phase },
          _max: { order: true },
        });
        const masterOrder = (masterMax._max.order ?? -1) + 1;

        await tx.masterChecklistItem.create({
          data: {
            phase: data.phase,
            label: data.label,
            order: masterOrder,
            isDefault: true,
          },
        });
      }

      return created;
    });

    await recordAudit(req, "CREATE", "TenderUpdateChecklist", item.id, data);
    res.status(201).json(item);
  })
);

router.delete(
  "/:tenderId/checklist/:itemId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const item = await prisma.tenderUpdateChecklist.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.tenderId !== req.params.tenderId) throw new HttpError(404, "Checklist item not found");
    await prisma.tenderUpdateChecklist.delete({ where: { id: item.id } });
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
