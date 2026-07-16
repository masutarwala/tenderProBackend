import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";

const router = Router();
router.use(authenticate);

router.get(
  "/bids-by-stage",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.tender.groupBy({ by: ["bidStage"], _count: { _all: true } });
    res.json(grouped.map((g) => ({ bidStage: g.bidStage, count: g._count._all })));
  })
);

router.get(
  "/emd-summary",
  asyncHandler(async (_req, res) => {
    const [held, paid, refunded, overdueRefunds] = await Promise.all([
      prisma.emdPayment.aggregate({ where: { status: "PAID", refund: null }, _sum: { amountPaid: true }, _count: true }),
      prisma.emdPayment.aggregate({ where: { status: "PAID" }, _sum: { amountPaid: true }, _count: true }),
      prisma.emdRefund.aggregate({ where: { status: "RECEIVED" }, _sum: { refundAmount: true }, _count: true }),
      prisma.emdRefund.findMany({
        where: { status: "IN_PROGRESS", expectedRefundDate: { lt: new Date() } },
        include: { emdPayment: { include: { requirement: { include: { tender: true } } } } },
      }),
    ]);

    const refundsReceived = await prisma.emdRefund.findMany({ where: { status: "RECEIVED", daysToRefund: { not: null } } });
    const avgDaysToRefund =
      refundsReceived.length > 0
        ? refundsReceived.reduce((sum, r) => sum + (r.daysToRefund ?? 0), 0) / refundsReceived.length
        : null;

    res.json({
      totalEmdHeld: held._sum.amountPaid ?? 0,
      totalEmdPaid: paid._sum.amountPaid ?? 0,
      totalEmdRefunded: refunded._sum.refundAmount ?? 0,
      paidCount: paid._count,
      refundedCount: refunded._count,
      averageDaysToRefund: avgDaysToRefund,
      overdueRefunds,
    });
  })
);

router.get(
  "/win-loss",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.outcomeRecord.groupBy({ by: ["outcome"], _count: { _all: true } });
    res.json(grouped.map((g) => ({ outcome: g.outcome, count: g._count._all })));
  })
);

export default router;
