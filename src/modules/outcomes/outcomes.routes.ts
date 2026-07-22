import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const LOST_REASONS = ["PRICE", "OEM_PREFERENCE", "TERMS_AND_CONDITIONS", "LATE_SUBMISSION", "TECHNICAL_DISQUALIFICATION", "OTHER"] as const;

const schema = z.object({
  outcome: z.enum(["WON", "LOST"]),
  submittedAt: z.coerce.date().optional(),
  orderId: z.string().optional(),
  contractValue: z.number().optional(),
  contractSignedDate: z.coerce.date().optional(),
  lostReason: z.enum(LOST_REASONS).optional(),
  lostTo: z.string().optional(),
  bidAmount: z.number().optional(),
  winningBidAmount: z.number().optional(),
  remarks: z.string().optional(),
  emdAmount: z.number().optional(),
  emdDetails: z.string().optional(),
  outcomeDate: z.coerce.date().optional(),
  decisionDate: z.coerce.date().optional(),
});

// Recording the outcome auto-triggers the EMD refund workflow (spec §5.2 "Closed
// Stage - EMD Refund Lifecycle", §11.2 "Refund Trigger: Automatic ... when bid
// outcome recorded") by creating an EmdRefund row in INITIATED status, pre-filled
// with the reason implied by the outcome, for Finance to action. BIDDER can also
// record the outcome from the Update Tender page's Submission tab (the field team
// logging the actual result) — that path skips the refund automation, which stays
// tied to the CEO/SALES_MANAGER-level confirmation, same as before.
router.post(
  "/:tenderId",
  requireRole("CEO", "SALES_MANAGER", "BIDDER"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = schema.parse(req.body);
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.tenderId },
      include: { emdRequirement: { include: { emdPayment: true } } },
    });
    if (!tender) throw new HttpError(404, "Tender not found");

    const outcomeRecord = await prisma.outcomeRecord.upsert({
      where: { tenderId: tender.id },
      update: { ...data, recordedById: req.user!.userId },
      create: { tenderId: tender.id, ...data, recordedById: req.user!.userId },
    });

    // Recording the outcome is the Submission phase's completion event — closes
    // the tender the same way finishing the old SUBMISSION checklist used to.
    if (tender.bidStage === "SUBMISSION") {
      await prisma.tender.update({ where: { id: tender.id }, data: { bidStage: "CLOSED" } });
    }

    const isFormalConfirmation = ["CEO", "SALES_MANAGER"].includes(req.user!.role);
    const payment = tender.emdRequirement?.emdPayment;
    if (isFormalConfirmation && payment && payment.status === "PAID") {
      const reason = data.outcome === "WON" ? "WON_NOT_REQUIRED" : "LOST_PER_TERMS";
      await prisma.emdRefund.upsert({
        where: { emdPaymentId: payment.id },
        update: {},
        create: {
          emdPaymentId: payment.id,
          status: "INITIATED",
          refundReason: reason,
          refundAmount: payment.amountPaid,
          initiatedById: req.user!.userId,
          initiatedAt: new Date(),
        },
      });
    }

    await recordAudit(req, "CREATE", "OutcomeRecord", outcomeRecord.id, data);
    res.status(201).json(outcomeRecord);
  })
);

export default router;
