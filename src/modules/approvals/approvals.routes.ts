import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const decisionSchema = z.object({
  comments: z.string().optional(),
});

router.get(
  "/pending",
  requireRole("FINANCE", "SALES_MANAGER", "CEO", "ADMIN"),
  asyncHandler(async (_req, res) => {
    const tenders = await prisma.tender.findMany({
      where: { opportunityDetails: { approvalRecord: { overallStatus: "PENDING" } } },
      include: {
        customer: true,
        opportunityDetails: { include: { approvalRecord: true } },
        emdRequirement: { include: { emdPayment: true } },
      },
    });
    res.json(tenders);
  })
);

// Finance, Sales Manager, and CEO each PATCH independently, in any order
// (spec §14 "Concurrent approvals"). Every decision is an approve — there is
// no reject/send-back path. Overall status flips to COMPLETED once all three
// have approved.
async function applyDecision(
  req: AuthedRequest,
  approverField: "financeApproved" | "salesMgrApproved" | "ceoApproved",
  approverIdField: "financeApproverId" | "salesMgrApproverId" | "ceoApproverId",
  atField: "financeAt" | "salesMgrAt" | "ceoAt",
  commentsField: "financeComments" | "salesMgrComments" | "ceoComments"
) {
  const { opportunityId } = req.params;
  const { comments } = decisionSchema.parse(req.body);

  const existing = await prisma.approvalRecord.findUnique({ where: { opportunityId } });
  if (!existing) throw new HttpError(404, "Approval record not found");

  const updated = await prisma.approvalRecord.update({
    where: { opportunityId },
    data: {
      [approverField]: true,
      [approverIdField]: req.user!.userId,
      [atField]: new Date(),
      [commentsField]: comments,
    },
  });

  const allApproved = updated.financeApproved && updated.salesMgrApproved && updated.ceoApproved;
  const overallStatus = allApproved ? "COMPLETED" : "PENDING";

  const final = await prisma.approvalRecord.update({
    where: { opportunityId },
    data: { overallStatus },
  });

  await recordAudit(req, "UPDATE", "ApprovalRecord", final.id, { [approverField]: true, overallStatus });
  return final;
}

router.patch(
  "/:opportunityId/finance",
  requireRole("FINANCE", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await applyDecision(req, "financeApproved", "financeApproverId", "financeAt", "financeComments"));
  })
);

router.patch(
  "/:opportunityId/sales-manager",
  requireRole("SALES_MANAGER", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await applyDecision(req, "salesMgrApproved", "salesMgrApproverId", "salesMgrAt", "salesMgrComments"));
  })
);

router.patch(
  "/:opportunityId/ceo",
  requireRole("CEO", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await applyDecision(req, "ceoApproved", "ceoApproverId", "ceoAt", "ceoComments"));
  })
);

export default router;
