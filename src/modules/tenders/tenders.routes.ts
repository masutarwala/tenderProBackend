import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { canManageTender, canUpdateTenderStatus } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

// Derives the display-facing "TENDER001" style ID from the internal tenderSeq
// auto-increment counter — see the Tender.tenderSeq comment in schema.prisma.
function formatTenderId(seq: number): string {
  return `TENDER${String(seq).padStart(3, "0")}`;
}

function withTenderId<T extends { tenderSeq: number }>(tender: T) {
  return { ...tender, tenderId: formatTenderId(tender.tenderSeq) };
}

const TENDER_TYPES = ["HARDWARE", "SOFTWARE", "SERVICES"] as const;
const AWARD_CRITERIA = ["AUCTION", "LOWEST", "QCBS"] as const;

const createSchema = z.object({
  tenderRefNo: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  tenderType: z.enum(TENDER_TYPES),

  publishedDate: z.coerce.date().nullable().optional(),
  closingDate: z.coerce.date(),
  preBidDate: z.coerce.date().nullable().optional(),
  bidOpeningDate: z.coerce.date().nullable().optional(),

  tenderValue: z.number().nullable().optional(),
  bidValue: z.number().nullable().optional(),
  emdAmount: z.number().nullable().optional(),
  emdStatus: z.enum(["PENDING", "PAID"]).nullable().optional(),
  awardCriteria: z.enum(AWARD_CRITERIA).nullable().optional(),
  bidValidity: z.string().nullable().optional(),
  securityDeposit: z.string().nullable().optional(),
  slaPenalties: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  contractPeriod: z.string().nullable().optional(),

  customerId: z.string().min(1, "Customer is required"),
  decisionDate: z.coerce.date().nullable().optional(),

  // Tender Assignment Workflow — every tender must have exactly one Bidder
  // and one Sales Executive.
  bidderId: z.string().min(1),
  salesExecId: z.string().min(1),
});

router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { stage, status } = req.query as { stage?: string; status?: string };
    const where: any = {};
    if (stage) where.stage = stage;
    if (status) where.status = status;
    // All authenticated users can view every tender — no role-based filtering.
    const tenders = await prisma.tender.findMany({
      where,
      include: {
        bidder: { select: { id: true, fullName: true } },
        salesExec: { select: { id: true, fullName: true } },
        customer: true,
        outcomeRecord: true,
        tasks: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(tenders.map(withTenderId));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.id },
      include: {
        bidder: { select: { id: true, fullName: true } },
        salesExec: { select: { id: true, fullName: true } },
        customer: true,
        outcomeRecord: true,
        tasks: {
          include: {
            assignedUser: { select: { id: true, fullName: true } },
            completedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        comments: {
          include: {
            user: { select: { id: true, fullName: true, isAdmin: true } },
            task: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        documents: {
          include: { uploadedBy: { select: { id: true, fullName: true, isAdmin: true } } },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
    if (!tender) throw new HttpError(404, "Tender not found");
    res.json(withTenderId(tender));
  })
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);
    if (!data.publishedDate) data.publishedDate = new Date();
    const tender = await prisma.tender.create({ data });
    await recordAudit(req, "CREATE", "Tender", tender.id);
    res.status(201).json(withTenderId(tender));
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id } });
    if (!tender) throw new HttpError(404, "Tender not found");
    if (!canManageTender(req.user!, tender)) {
      throw new HttpError(403, "Only Admin or the assigned Bidder/Sales Executive can edit this tender");
    }
    const data = createSchema.partial().parse(req.body);
    const updated = await prisma.tender.update({ where: { id: req.params.id }, data });
    await recordAudit(req, "UPDATE", "Tender", updated.id, data);
    res.json(withTenderId(updated));
  })
);

const stageStatusSchema = z.object({
  stage: z.enum(["EVALUATION", "PREPARATION", "SUBMISSION"]).optional(),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  comment: z.string().trim().min(1, "A comment is required when changing Stage/Status"),
});

// Evaluation -> Preparation -> Submission, forward-only. The stage never
// moves backward once advanced, and a tender with a recorded Outcome (Won,
// Lost, or Dropped via "No Go") is closed — no further stage changes at all.
const STAGE_ORDER = { EVALUATION: 0, PREPARATION: 1, SUBMISSION: 2 } as const;

// Manual Stage/Status change — Admin or the assigned Bidder/Sales Executive
// only. No automatic gating beyond forward-only ordering; every change
// requires a comment, logged alongside it.
router.post(
  "/:id/stage-status",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await prisma.tender.findUnique({ where: { id: req.params.id }, include: { outcomeRecord: true, customer: true } });
    if (!tender) throw new HttpError(404, "Tender not found");
    if (!canUpdateTenderStatus(req.user!, tender)) {
      throw new HttpError(403, "Only Admin or the assigned Bidder can change Stage/Status");
    }
    if (tender.outcomeRecord) {
      throw new HttpError(400, "This tender's outcome has already been recorded — Stage can no longer be changed");
    }
    const { stage, status, comment } = stageStatusSchema.parse(req.body);
    if (!stage && !status) throw new HttpError(400, "Provide a new stage and/or status");
    if (stage && STAGE_ORDER[stage] < STAGE_ORDER[tender.stage]) {
      throw new HttpError(400, "Stage cannot move backward");
    }

    // "Mark Submitted" gate: every required task must be done, and the
    // Customer/Financial fields the client needs on hand before submission
    // must already be filled in via Save Details.
    if (stage === "SUBMISSION") {
      const missingFields: string[] = [];
      if (!tender.customer?.address) missingFields.push("Address");
      if (!tender.customer?.email) missingFields.push("Email");
      if (!tender.customer?.phone) missingFields.push("Phone");
      if (!tender.customer?.contactName) missingFields.push("Contact Person");
      if (tender.bidValue == null) missingFields.push("Bid Value");
      if (!tender.awardCriteria) missingFields.push("Award Criteria");
      if (missingFields.length > 0) {
        throw new HttpError(400, `Complete these fields before marking as Submitted: ${missingFields.join(", ")}`);
      }

      const pendingRequiredCount = await prisma.tenderTask.count({
        where: { tenderId: tender.id, isRequired: true, status: "PENDING" },
      });
      if (pendingRequiredCount > 0) {
        throw new HttpError(400, "All required tasks must be completed before marking as Submitted");
      }
    }

    const updated = await prisma.tender.update({
      where: { id: tender.id },
      data: { stage: stage ?? tender.stage, status: status ?? tender.status },
    });
    const isStageChange = stage && stage !== tender.stage;
    
    await prisma.comment.create({
      data: {
        tenderId: tender.id,
        userId: req.user!.userId,
        message: comment,
        stage: isStageChange ? tender.stage : updated.stage,
        status: isStageChange ? "COMPLETED" : updated.status,
      },
    });
    await recordAudit(req, "UPDATE", "Tender", updated.id, { stage, status });
    res.json(withTenderId(updated));
  })
);

export default router;
