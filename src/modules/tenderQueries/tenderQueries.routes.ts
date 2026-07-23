import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { recordAudit } from "../../middleware/audit";
import { isPhaseLocked } from "../../utils/phaseLock";

const router = Router();
router.use(authenticate);

const PHASES = ["EVALUATION", "PREPARATION"] as const;

// BIDDER manages every tender, so it can see/reply to every query regardless of
// visibility — matches the same rule already used for checklist/approvals.
const MANAGE_ROLES = ["BIDDER"];

const userSummary = { select: { fullName: true, role: { select: { name: true } } } };

const queryInclude = {
  createdBy: userSummary,
  targetRole: { select: { id: true, name: true } },
  replies: {
    include: { createdBy: userSummary },
    orderBy: { createdAt: "asc" as const },
  },
};

type VisibilityCheck = {
  visibility: string;
  createdById: string | null;
  targetRole: { name: string } | null;
};

// PUBLIC: visible/repliable to anyone who can reach this endpoint (i.e. anyone
// who can open the tender). PRIVATE: only the creator, BIDDER, and whoever holds
// the targeted role — the whole point of "private" is it doesn't leak.
function canSee(query: VisibilityCheck, user: { userId: string; role: string }) {
  if (query.visibility === "PUBLIC") return true;
  if (MANAGE_ROLES.includes(user.role)) return true;
  if (query.createdById === user.userId) return true;
  return query.targetRole?.name === user.role;
}

router.get(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await prisma.tenderQuery.findMany({
      where: { tenderId: req.params.tenderId },
      include: queryInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.filter((r) => canSee(r, req.user!)));
  })
);

const createSchema = z
  .object({
    phase: z.enum(PHASES),
    message: z.string().trim().min(1),
    visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
    targetRoleId: z.string().optional(),
  })
  .refine((d) => d.visibility === "PUBLIC" || !!d.targetRoleId, {
    message: "targetRoleId is required for private queries",
    path: ["targetRoleId"],
  });

router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createSchema.parse(req.body);

    const tender = await prisma.tender.findUnique({
      where: { id: req.params.tenderId },
      select: { stage: true },
    });
    if (!tender) throw new HttpError(404, "Tender not found");

    if (isPhaseLocked(tender.stage, data.phase)) {
      throw new HttpError(400, `Cannot create query: the ${data.phase.toLowerCase()} stage is already completed.`);
    }

    const row = await prisma.tenderQuery.create({
      data: {
        tenderId: req.params.tenderId,
        phase: data.phase,
        message: data.message,
        visibility: data.visibility,
        targetRoleId: data.visibility === "PRIVATE" ? data.targetRoleId : null,
        createdById: req.user!.userId,
      },
      include: queryInclude,
    });
    await recordAudit(req, "CREATE", "TenderQuery", row.id, data);
    res.status(201).json(row);
  })
);

const replySchema = z.object({ message: z.string().trim().min(1) });

// Posting a reply is also how a query gets marked resolved — the first response
// closes it out, matching "after response is given for query then it's marked
// as resolved."
router.post(
  "/:tenderId/:queryId/replies",
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = replySchema.parse(req.body);
    const query = await prisma.tenderQuery.findUnique({
      where: { id: req.params.queryId },
      include: { targetRole: { select: { name: true } } },
    });
    if (!query || query.tenderId !== req.params.tenderId) throw new HttpError(404, "Query not found");
    if (!canSee(query, req.user!)) throw new HttpError(403, "You can't reply to this query");

    const tender = await prisma.tender.findUnique({
      where: { id: req.params.tenderId },
      select: { stage: true },
    });
    if (!tender) throw new HttpError(404, "Tender not found");

    if (isPhaseLocked(tender.stage, query.phase as "EVALUATION" | "PREPARATION")) {
      throw new HttpError(400, `Cannot reply: the ${query.phase.toLowerCase()} stage is already completed.`);
    }

    const reply = await prisma.tenderQueryReply.create({
      data: { queryId: query.id, message: data.message, createdById: req.user!.userId },
      include: { createdBy: userSummary },
    });

    if (query.status !== "RESOLVED") {
      await prisma.tenderQuery.update({ where: { id: query.id }, data: { status: "RESOLVED" } });
    }

    await recordAudit(req, "CREATE", "TenderQueryReply", reply.id, data);
    res.status(201).json(reply);
  })
);

export default router;
