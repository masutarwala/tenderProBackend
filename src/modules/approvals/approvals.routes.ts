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
  approved: z.boolean(),
  comments: z.string().optional(),
});

router.get(
  "/pending",
  requireRole("FINANCE", "SALES_MANAGER", "CEO", "ADMIN"),
  asyncHandler(async (_req, res) => {
    const tenders = await prisma.tender.findMany({
      where: { opportunityStatus: "PENDING_APPROVAL" },
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
// (spec §14 "Concurrent approvals"). Overall status flips to APPROVED only
// once all three have approved; any rejection immediately sets SENT_BACK/REJECTED.
async function applyDecision(
  req: AuthedRequest,
  approverField: "financeApproved" | "salesMgrApproved" | "ceoApproved",
  approverIdField: "financeApproverId" | "salesMgrApproverId" | "ceoApproverId",
  atField: "financeAt" | "salesMgrAt" | "ceoAt",
  commentsField: "financeComments" | "salesMgrComments" | "ceoComments"
) {
  const { opportunityId } = req.params;
  const { approved, comments } = decisionSchema.parse(req.body);

  const existing = await prisma.approvalRecord.findUnique({ where: { opportunityId } });
  if (!existing) throw new HttpError(404, "Approval record not found");

  const updated = await prisma.approvalRecord.update({
    where: { opportunityId },
    data: {
      [approverField]: approved,
      [approverIdField]: req.user!.userId,
      [atField]: new Date(),
      [commentsField]: comments,
    },
  });

  let overallStatus: "PENDING" | "APPROVED" | "SENT_BACK" | "REJECTED" = "PENDING";
  if (updated.financeApproved === false || updated.salesMgrApproved === false || updated.ceoApproved === false) {
    overallStatus = approved === false ? "SENT_BACK" : overallStatus;
  }
  const allApproved = updated.financeApproved && updated.salesMgrApproved && updated.ceoApproved;
  if (allApproved) overallStatus = "APPROVED";
  else if (approved === false) overallStatus = "SENT_BACK";

  const final = await prisma.approvalRecord.update({
    where: { opportunityId },
    data: {
      overallStatus,
      sentBackComments: overallStatus === "SENT_BACK" ? comments : existing.sentBackComments,
    },
  });

  const opp = await prisma.opportunityDetails.findUnique({ where: { id: opportunityId } });
  if (opp) {
    const newOpportunityStatus = overallStatus === "APPROVED" ? "APPROVED" : overallStatus === "SENT_BACK" ? "SENT_BACK" : "PENDING_APPROVAL";
    await prisma.tender.update({ where: { id: opp.tenderId }, data: { opportunityStatus: newOpportunityStatus } });
  }

  await recordAudit(req, "UPDATE", "ApprovalRecord", final.id, { [approverField]: approved, overallStatus });
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
