import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { canManageTender, canUpdateTenderStatus } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

// Won/Lost require their specific mandatory fields (per the "Submitted to
// Win/Lost" workflow); Dropped (the Evaluation "No Go" path) only needs a
// reason, matching what the frontend's No Go prompt already collects.
const schema = z
  .object({
    outcome: z.enum(["WON", "LOST", "DROPPED", "NO_GO", "DROPPED_BY_US", "WITHDRAWN_BY_CLIENT"]),
    decisionDate: z.coerce.date().optional(),
    winningBidAmount: z.number().optional(),
    winner: z.string().optional(),
    reasonForLoss: z.string().optional(),
    comment: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === "WON" || data.outcome === "LOST") {
      if (data.winningBidAmount == null) ctx.addIssue({ code: "custom", path: ["winningBidAmount"], message: "Win Value is required" });
      if (!data.decisionDate) ctx.addIssue({ code: "custom", path: ["decisionDate"], message: "Decision Date is required" });
      if (!data.comment) ctx.addIssue({ code: "custom", path: ["comment"], message: "Comments is required" });
    }
    if (data.outcome === "LOST" && !data.winner) {
      ctx.addIssue({ code: "custom", path: ["winner"], message: "Competitor is required" });
    }
  });

// Dropped (via "No Go") can be recorded from any stage; Won/Lost only apply
// once the tender has actually reached Submission.
router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { comment, ...data } = schema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, include: { outcomeRecord: true } });
    if (!tender) throw new HttpError(404, "Tender not found");
    if (!canUpdateTenderStatus(req.user!, tender)) {
      throw new HttpError(403, "Only Admin or the assigned Bidder can record the outcome");
    }
    if ((data.outcome === "WON" || data.outcome === "LOST") && tender.stage !== "SUBMISSION") {
      throw new HttpError(400, "Win/Lost can only be recorded once the tender has reached Submission");
    }

    const outcomeRecord = await prisma.outcomeRecord.upsert({
      where: { tenderId: tender.id },
      update: { ...data, recordedById: req.user!.userId },
      create: { tenderId: tender.id, ...data, recordedById: req.user!.userId },
    });

    await prisma.tender.update({
      where: { id: tender.id },
      data: { status: "COMPLETED" },
    });

    if (comment) {
      await prisma.comment.create({
        data: { tenderId: tender.id, userId: req.user!.userId, message: comment, stage: tender.stage, status: "COMPLETED" },
      });
    }

    await recordAudit(req, "CREATE", "OutcomeRecord", outcomeRecord.id, data);
    res.status(201).json(outcomeRecord);
  })
);

export default router;
