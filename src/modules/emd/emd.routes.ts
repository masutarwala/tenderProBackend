import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { canTransitionEmdPayment, canTransitionEmdRefund } from "../../utils/emdStateMachine";

const router = Router();
router.use(authenticate);

// ---- Payments ----

router.get(
  "/payments",
  requireRole("FINANCE", "ADMIN", "CEO"),
  asyncHandler(async (_req, res) => {
    const payments = await prisma.emdPayment.findMany({
      include: { requirement: { include: { tender: { include: { customer: true } } } }, refund: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(payments);
  })
);

router.get(
  "/payments/:id",
  asyncHandler(async (req, res) => {
    const payment = await prisma.emdPayment.findUnique({
      where: { id: req.params.id },
      include: { requirement: { include: { tender: true } }, refund: true },
    });
    if (!payment) throw new HttpError(404, "EMD payment not found");
    res.json(payment);
  })
);

const recordPaymentSchema = z.object({
  amountPaid: z.number().min(0),
  paymentDate: z.coerce.date(),
  paymentMode: z.string().min(1),
  paymentReference: z.string().min(1),
  notes: z.string().optional(),
});

// Bidder or Finance records payment details -> status moves PENDING/FAILED -> INITIATED -> SUBMITTED
// (spec §11.1 "Payment Recording"). Proof upload happens via the generic /documents endpoint
// with entityType=EmdPayment.
router.post(
  "/payments/:id/record",
  requireRole("BIDDER", "FINANCE", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = recordPaymentSchema.parse(req.body);
    const payment = await prisma.emdPayment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new HttpError(404, "EMD payment not found");
    // Bidder UX collapses PENDING/FAILED -> INITIATED -> SUBMITTED into one call.
    const nextStatus = "SUBMITTED";
    const updated = await prisma.emdPayment.update({
      where: { id: payment.id },
      data: { ...data, status: nextStatus, paidById: req.user!.userId, failureReason: null },
    });
    await recordAudit(req, "UPDATE", "EmdPayment", updated.id, { status: nextStatus });
    res.json(updated);
  })
);

const verifySchema = z.object({
  verified: z.boolean(),
  failureReason: z.string().optional(),
});

// Finance verification: SUBMITTED -> PAID or SUBMITTED -> FAILED (spec §11.1 "Payment Verification")
router.post(
  "/payments/:id/verify",
  requireRole("FINANCE", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { verified, failureReason } = verifySchema.parse(req.body);
    const payment = await prisma.emdPayment.findUnique({ where: { id: req.params.id } });
    if (!payment) throw new HttpError(404, "EMD payment not found");

    const targetStatus = verified ? "PAID" : "FAILED";
    if (!canTransitionEmdPayment(payment.status as any, targetStatus)) {
      throw new HttpError(400, `Cannot move EMD payment from ${payment.status} to ${targetStatus}`);
    }
    const updated = await prisma.emdPayment.update({
      where: { id: payment.id },
      data: { status: targetStatus, failureReason: verified ? null : failureReason },
    });
    await recordAudit(req, "UPDATE", "EmdPayment", updated.id, { status: targetStatus });
    res.json(updated);
  })
);

// ---- Refunds ----

router.get(
  "/refunds",
  requireRole("FINANCE", "ADMIN", "CEO"),
  asyncHandler(async (_req, res) => {
    const refunds = await prisma.emdRefund.findMany({
      include: { emdPayment: { include: { requirement: { include: { tender: { include: { customer: true } } } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(refunds);
  })
);

const refundUpdateSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RECEIVED", "ADJUSTED", "RETAINED", "CANCELLED"]),
  refundAmount: z.number().optional(),
  expectedRefundDate: z.coerce.date().optional(),
  actualRefundDate: z.coerce.date().optional(),
  notes: z.string().optional(),
});

// Finance progresses the refund lifecycle; RECEIVED calculates days-to-refund
// (spec §5.2 "Refund Received... Calculates days-to-refund (initiated -> received)").
router.patch(
  "/refunds/:id",
  requireRole("FINANCE", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = refundUpdateSchema.parse(req.body);
    const refund = await prisma.emdRefund.findUnique({ where: { id: req.params.id } });
    if (!refund) throw new HttpError(404, "EMD refund not found");
    if (!canTransitionEmdRefund(refund.status as any, data.status)) {
      throw new HttpError(400, `Cannot move EMD refund from ${refund.status} to ${data.status}`);
    }

    let daysToRefund = refund.daysToRefund;
    if (data.status === "RECEIVED" && refund.initiatedAt) {
      const actual = data.actualRefundDate ?? new Date();
      daysToRefund = Math.round((actual.getTime() - refund.initiatedAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    const updated = await prisma.emdRefund.update({
      where: { id: refund.id },
      data: { ...data, daysToRefund },
    });
    await recordAudit(req, "UPDATE", "EmdRefund", updated.id, data);
    res.json(updated);
  })
);

export default router;
