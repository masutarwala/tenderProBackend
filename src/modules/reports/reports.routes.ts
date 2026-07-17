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

const CLOSING_SOON_DAYS = 14;

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const tenders = await prisma.tender.findMany({
      include: {
        customer: true,
        outcomeRecord: true,
        emdRequirement: { include: { emdPayment: true } },
      },
    });

    const now = new Date();
    const daysUntil = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : null);

    const isActive = (t: (typeof tenders)[number]) => t.bidStage !== "CLOSED";
    const emdPending = (t: (typeof tenders)[number]) =>
      t.emdRequirement?.emdRequired && t.emdRequirement.emdPayment?.status !== "PAID";
    const notApproved = (t: (typeof tenders)[number]) =>
      !t.opportunityStatus || !["APPROVED", "BID"].includes(t.opportunityStatus);
    const isAtRisk = (t: (typeof tenders)[number]) => emdPending(t) || notApproved(t);

    // KPIs
    const activeTenders = tenders.filter(isActive);
    const pipelineValue = activeTenders.reduce((s, t) => s + (t.tenderValue ?? 0), 0);
    const STAGE_WEIGHT: Record<string, number> = { EVALUATION: 0.2, PREPARATION: 0.5, SUBMISSION: 0.8 };
    const weightedPipelineValue = activeTenders.reduce(
      (s, t) => s + (t.tenderValue ?? 0) * (STAGE_WEIGHT[t.bidStage] ?? 0.2),
      0
    );
    const won = tenders.filter((t) => t.outcomeRecord?.outcome === "WON");
    const lost = tenders.filter((t) => t.outcomeRecord?.outcome === "LOST");
    const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : null;
    const wonValue = won.reduce((s, t) => s + (t.outcomeRecord?.contractValue ?? t.tenderValue ?? 0), 0);
    const closingSoon = activeTenders.filter((t) => {
      const d = daysUntil(t.closingDate);
      return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS;
    });
    const atRiskCount = closingSoon.filter(isAtRisk).length;

    // Funnel
    const identified = tenders.filter((t) => t.prospectStatus !== "DROPPED");
    const qualified = tenders.filter((t) => t.prospectStatus === "SHORTLISTED");
    const submitted = tenders.filter(
      (t) => ["SUBMISSION", "CLOSED"].includes(t.bidStage) || t.opportunityStatus === "BID"
    );
    const funnelStage = (label: string, list: typeof tenders) => ({
      label,
      count: list.length,
      value: list.reduce((s, t) => s + (t.tenderValue ?? 0), 0),
    });
    const funnel = [
      funnelStage("Identified", identified),
      funnelStage("Qualified", qualified),
      funnelStage("Submitted", submitted),
      funnelStage("Won", won),
    ];

    // Buyer type
    const buyerMap = new Map<string, { count: number; value: number }>();
    for (const t of tenders) {
      const label = t.customer?.organizationType?.trim() || "Unspecified";
      const entry = buyerMap.get(label) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += t.tenderValue ?? 0;
      buyerMap.set(label, entry);
    }
    const buyerTotal = tenders.reduce((s, t) => s + (t.tenderValue ?? 0), 0);
    const buyerType = Array.from(buyerMap.entries())
      .map(([label, v]) => ({ label, count: v.count, value: v.value, pct: buyerTotal > 0 ? (v.value / buyerTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    // Domain (Customer.industry array, fallback to tender.subIndustry)
    const domainMap = new Map<string, { activeBids: number; won: number; lost: number }>();
    for (const t of tenders) {
      const labels = t.customer?.industry?.length ? t.customer.industry : t.subIndustry ? [t.subIndustry] : ["Unspecified"];
      for (const label of labels) {
        const entry = domainMap.get(label) ?? { activeBids: 0, won: 0, lost: 0 };
        if (isActive(t)) entry.activeBids += 1;
        if (t.outcomeRecord?.outcome === "WON") entry.won += 1;
        if (t.outcomeRecord?.outcome === "LOST") entry.lost += 1;
        domainMap.set(label, entry);
      }
    }
    const domain = Array.from(domainMap.entries())
      .map(([label, v]) => ({
        label,
        activeBids: v.activeBids,
        winRate: v.won + v.lost > 0 ? (v.won / (v.won + v.lost)) * 100 : null,
      }))
      .filter((d) => d.activeBids > 0)
      .sort((a, b) => b.activeBids - a.activeBids);

    // States
    const stateMap = new Map<string, number>();
    for (const t of tenders) {
      const label = t.state?.trim() || "Unspecified";
      stateMap.set(label, (stateMap.get(label) ?? 0) + (t.tenderValue ?? 0));
    }
    const states = Array.from(stateMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // Alerts: closing soon, not yet closed
    const alerts = closingSoon
      .map((t) => {
        const d = daysUntil(t.closingDate)!;
        const atRisk = isAtRisk(t);
        const risk: "danger" | "warning" | "ok" = d <= 3 || atRisk ? (d <= 3 ? "danger" : "warning") : "ok";
        const reason = emdPending(t) ? "EMD pending" : notApproved(t) ? "Approval pending" : `${d} day(s) left`;
        return {
          id: t.id,
          title: t.title,
          buyerLabel: t.customer?.organizationType?.trim() || "Unspecified",
          value: t.tenderValue ?? 0,
          daysLeft: d,
          risk,
          reason,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    res.json({
      kpis: {
        activeBids: activeTenders.length,
        pipelineValue,
        weightedPipelineValue,
        winRate,
        wonCount: won.length,
        lostCount: lost.length,
        wonValue,
        closingSoonCount: closingSoon.length,
        atRiskCount,
      },
      funnel,
      buyerType,
      domain,
      states,
      alerts,
    });
  })
);

export default router;
