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

    // "Bid Value" if set, else fall back to "Bid Worth" (tenderValue) — matches
    // the same fallback used on the tender detail page's Financial section.
    const bidAmount = (t: (typeof tenders)[number]) => (t.bidValue && t.bidValue > 0 ? t.bidValue : t.tenderValue ?? 0);

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
    const funnelStage = (label: string, list: typeof tenders) => ({
      label,
      count: list.length,
      value: list.reduce((s, t) => s + bidAmount(t), 0),
    });
    const funnel = [
      funnelStage("Evaluation", tenders),
      funnelStage("Preparation", tenders.filter((t) => t.stage !== "EVALUATION")),
      funnelStage("Submission", tenders.filter((t) => t.stage === "SUBMISSION")),
      funnelStage("Won", won),
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
    });
  })
);

export default router;
