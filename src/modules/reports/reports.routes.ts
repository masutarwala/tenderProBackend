import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";

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
  asyncHandler(async (req: AuthedRequest, res) => {
    // Admin: unfiltered by default, optionally narrowed via bidderId /
    // salesExecId query params (either role matching counts — an OR — when
    // both are given). Everyone else: always forced to their own userId in
    // either role, regardless of any query params — the whole dashboard is
    // scoped to bids they're actually on.
    const { bidderId, salesExecId } = req.query as { bidderId?: string; salesExecId?: string };
    
    const kamalUser = await prisma.user.findUnique({ where: { email: "kamal@swansol.com" } });
    
    let where: any = {};
    if (!req.user!.isAdmin) {
      where = { OR: [{ bidderId: req.user!.userId }, { salesExecId: req.user!.userId }] };
    } else {
      let conditions = [];
      if (bidderId || salesExecId) {
        conditions.push({ OR: [...(bidderId ? [{ bidderId }] : []), ...(salesExecId ? [{ salesExecId }] : [])] });
      }
      if (kamalUser) {
        conditions.push({
          AND: [
            { bidderId: { not: kamalUser.id } },
            { salesExecId: { not: kamalUser.id } }
          ]
        });
      }
      if (conditions.length > 0) {
        where = { AND: conditions };
      }
    }

    const tenders = await prisma.tender.findMany({
      where,
      include: { outcomeRecord: true, customer: true },
    });

    const now = new Date();
    const daysUntil = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : null);

    // Single "how much is this bid worth" figure, used for every amount
    // below regardless of stage: Win Value if the outcome has been
    // recorded, else Submit Value (bidValue), else Estimate Value
    // (tenderValue). Must stay in sync with the equivalent cascade in
    // tenderpro_frontend/src/utils/bidWorth.ts.
    const bidAmount = (t: (typeof tenders)[number]) => {
      if (t.outcomeRecord?.winningBidAmount != null) return t.outcomeRecord.winningBidAmount;
      if (t.bidValue != null) return t.bidValue;
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
    const wonValue = won.reduce((s, t) => s + bidAmount(t), 0);
    const closingSoon = activeTenders.filter((t) => {
      const d = daysUntil(t.closingDate);
      return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS;
    });

    // Funnel — every tender starts at Evaluation, so each later stage is a
    // subset of tenders that reached at least that far in the pipeline.
    // Won is a separate outcome-based bucket, not a pipeline stage.
    const funnelStage = (label: string, list: typeof tenders) => ({
      label,
      count: list.length,
      value: list.reduce((s, t) => s + bidAmount(t), 0),
    });
    const funnel = [
      funnelStage("Evaluation", activeTenders.filter((t) => t.stage === "EVALUATION")),
      funnelStage("Preparation", activeTenders.filter((t) => t.stage === "PREPARATION")),
      funnelStage("Submission", activeTenders.filter((t) => t.stage === "SUBMISSION")),
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

    const daysSince = (d: Date | null) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000)) : 0);

    // Helper to check if a bid is closed (status COMPLETED or outcome recorded as LOST/DROPPED)
    const isBidClosed = (t: (typeof tenders)[number]) => {
      if (t.status === "COMPLETED") return true;
      if (t.outcomeRecord && t.outcomeRecord.outcome !== "WON") return true;
      return false;
    };

    // 1. All EMD Bids ever paid, RECOVERED included — it was still money paid
    // out historically (10 bids total - EMD Invested)
    const allPaidTenders = tenders.filter(t => (t.emdStatus === "PAID" || t.emdStatus === "RECOVERED") && (t.emdAmount ?? 0) > 0);

    // "Recovered" (via EMD Status, or the older outcome-flow isEmdRecovered
    // flag) is excluded from both the pending-recovery and active-paid
    // views below — either signal means there's nothing left to track.
    const isRecovered = (t: (typeof tenders)[number]) => t.emdStatus === "RECOVERED" || !!t.outcomeRecord?.isEmdRecovered;

    const emdInvestedTotal = {
      count: allPaidTenders.length,
      amount: allPaidTenders.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0)
    };

    // 2. Closed Paid EMD Bids pending recovery (6 bids total - EMD Recover)
    const dueTendersAll = allPaidTenders.filter(t => !isRecovered(t) && isBidClosed(t));
    const emdRecoverTotal = {
      count: dueTendersAll.length,
      amount: dueTendersAll.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0)
    };

    // 3. Active Paid EMD Bids (4 bids total)
    const activePaidTenders = allPaidTenders.filter(t => !isRecovered(t) && !isBidClosed(t));
    const emdActiveTotal = {
      count: activePaidTenders.length,
      amount: activePaidTenders.reduce((sum, t) => sum + (t.emdAmount ?? 0), 0)
    };

    // Detail List 1: Pending EMD Recovery (6 tenders) with daysSinceOutcome
    const emdOverdue = dueTendersAll
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(t => {
        const outcomeDate = t.outcomeRecord?.recordedAt || t.outcomeRecord?.decisionDate || t.updatedAt;
        return {
          tenderId: `TENDER${String(t.tenderSeq).padStart(3, "0")}`,
          title: t.title,
          emdAmount: t.emdAmount ?? 0,
          daysSinceOutcome: daysSince(outcomeDate)
        };
      });

    // Detail List 2: Active Paid EMD (4 tenders) with daysSinceSubmission
    const emdPaid = activePaidTenders
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(t => {
        const subDate = t.publishedDate || t.createdAt;
        return {
          tenderId: `TENDER${String(t.tenderSeq).padStart(3, "0")}`,
          title: t.title,
          emdAmount: t.emdAmount ?? 0,
          daysSinceSubmission: daysSince(subDate)
        };
      });

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
        emdInvestedTotal,
        emdRecoverTotal,
        emdDueTotal: emdRecoverTotal,
        emdPaidTotal: emdInvestedTotal,
      },
      funnel,
      alerts,
      emdOverdue,
      emdOverdueTotal: emdRecoverTotal,
      emdPaid,
      emdPaidTotal: emdActiveTotal,
    });
  })
);

export default router;
