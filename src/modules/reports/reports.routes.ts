import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";

const router = Router();
router.use(authenticate);

router.get(
  "/bids-by-stage",
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.tender.groupBy({ by: ["stage"], _count: { _all: true } });
    res.json(grouped.map((g) => ({ stage: g.stage, count: g._count._all })));
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
      include: { outcomeRecord: true, customer: true },
    });

    const now = new Date();
    const daysUntil = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : null);

    // Value calculation rules:
    // Evaluation/Preparation -> Bid Worth (tenderValue)
    // Submission -> Bid Value (bidValue)
    const bidAmount = (t: (typeof tenders)[number]) => {
      if (t.stage === "SUBMISSION") {
        return t.bidValue ?? 0;
      }
      return t.tenderValue ?? 0;
    };

    const isActive = (t: (typeof tenders)[number]) => t.status !== "COMPLETED";

    // KPIs
    const activeTenders = tenders.filter(isActive);
    const pipelineValue = activeTenders.reduce((s, t) => s + bidAmount(t), 0);
    const won = tenders.filter((t) => t.outcomeRecord?.outcome === "WON");
    const lost = tenders.filter((t) => t.outcomeRecord?.outcome === "LOST");
    const dropped = tenders.filter((t) => t.outcomeRecord?.outcome === "DROPPED");
    const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : null;
    const wonValue = won.reduce((s, t) => s + (t.outcomeRecord?.winningBidAmount ?? bidAmount(t)), 0);
    const closingSoon = activeTenders.filter((t) => {
      const d = daysUntil(t.closingDate);
      return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS;
    });

    // Funnel — every tender starts at Evaluation, so each later stage is a
    // subset of tenders that reached at least that far in the pipeline.
    const funnelStage = (label: string, list: typeof tenders, valueFn: (t: (typeof tenders)[number]) => number) => ({
      label,
      count: list.length,
      value: list.reduce((s, t) => s + valueFn(t), 0),
    });
    const funnel = [
      funnelStage("Evaluation", activeTenders.filter((t) => t.stage === "EVALUATION"), (t) => t.tenderValue ?? 0),
      funnelStage("Preparation", activeTenders.filter((t) => t.stage === "PREPARATION"), (t) => t.tenderValue ?? 0),
      funnelStage("Submission", activeTenders.filter((t) => t.stage === "SUBMISSION"), (t) => t.bidValue ?? 0),
      funnelStage("Won", won, (t) => t.outcomeRecord?.winningBidAmount ?? 0),
    ];

    // Alerts: closing soon, not yet closed
    const alerts = closingSoon
      .map((t) => {
        const d = daysUntil(t.closingDate)!;
        const risk: "danger" | "warning" | "ok" = d <= 3 ? "danger" : "warning";
        return {
          id: t.id,
          tenderId: `TENDER${String(t.tenderSeq).padStart(3, "0")}`,
          title: t.title,
          buyerLabel: t.customer?.name?.trim() || "Unspecified",
          value: bidAmount(t),
          daysLeft: d,
          risk,
          reason: `${d} day(s) left`,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // EMD Recovery Pending/Overdue: Lost/Dropped tenders that have not yet recovered the EMD
    const overdueItems = tenders
      .filter(t => (t as any).emdStatus === "PAID" && t.outcomeRecord && t.outcomeRecord.outcome !== "WON" && !(t.outcomeRecord as any).isEmdRecovered)
      .map(t => {
        const d = (t.outcomeRecord as any)!.emdRecoveryDate ? daysUntil((t.outcomeRecord as any)!.emdRecoveryDate) : null;
        return {
          tenderId: `TENDER${String(t.tenderSeq).padStart(3, "0")}`,
          title: t.title,
          emdAmount: t.emdAmount ?? 0,
          // ageDays > 0 means past due. If d is null, or d > 0 (future), ageDays is 0 or negative.
          // We'll pass it to frontend so frontend can say "Pending" or "Overdue by X days"
          ageDays: d !== null ? -d : null
        };
      });

    const emdOverdueTotal = {
      count: overdueItems.length,
      amount: overdueItems.reduce((sum, t) => sum + t.emdAmount, 0)
    };

    const emdOverdue = overdueItems
      .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
      .slice(0, 6);

    // Paid EMD: Active/Won tenders (not lost/dropped) that have EMD paid
    const paidTendersAll = tenders.filter(t => {
      const isLostOrDrop = t.outcomeRecord && t.outcomeRecord.outcome !== "WON";
      return !isLostOrDrop && (t as any).emdStatus === "PAID" && (t.emdAmount ?? 0) > 0;
    });

    const emdPaidTotal = {
      count: paidTendersAll.length,
      amount: paidTendersAll.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0)
    };

    const emdPaid = paidTendersAll
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 6)
      .map(t => ({
        tenderId: `TENDER${String(t.tenderSeq).padStart(3, "0")}`,
        title: t.title,
        emdAmount: t.emdAmount ?? 0
      }));

    res.json({
      kpis: {
        activeBids: activeTenders.length,
        pipelineValue,
        winRate,
        wonCount: won.length,
        lostCount: lost.length,
        droppedCount: dropped.length,
        wonValue,
        closingSoonCount: closingSoon.length,
      },
      funnel,
      alerts,
      emdOverdue,
      emdOverdueTotal,
      emdPaid,
      emdPaidTotal,
    });
  })
);

export default router;
