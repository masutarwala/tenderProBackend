import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { canOpportunityEnterApproval } from "../../utils/emdStateMachine";
import { canTransitionOpportunity } from "../../utils/tenderStateMachine";

const router = Router();
router.use(authenticate);

const updateSchema = z.object({
  requirementsBreakdown: z.string().optional(),
  bomJson: z.string().optional(),
  pricingSummaryJson: z.string().optional(),
  preparationPercent: z.number().min(0).max(100).optional(),
});

router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    const opp = await prisma.opportunityDetails.findUnique({
      where: { tenderId: req.params.tenderId },
      include: { approvalRecord: true, bidSubmission: true, tender: { include: { emdRequirement: { include: { emdPayment: true } } } } },
    });
    if (!opp) throw new HttpError(404, "Opportunity not found for tender");
    res.json(opp);
  })
);

router.patch(
  "/:tenderId",
  requireRole("BIDDER", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateSchema.parse(req.body);
    
    const opp = await prisma.$transaction(async (tx) => {
      const updatedOpp = await tx.opportunityDetails.update({
        where: { tenderId: req.params.tenderId },
        data,
      });

      const tender = await tx.tender.findUnique({
        where: { id: req.params.tenderId },
      });

      if (tender && !tender.opportunityStatus) {
        await tx.tender.update({
          where: { id: req.params.tenderId },
          data: { opportunityStatus: "DRAFT" },
        });
      }

      return updatedOpp;
    });

    await recordAudit(req, "UPDATE", "OpportunityDetails", opp.id, data);
    res.json(opp);
  })
);

// Bidder marks bid ready: validates checklist + EMD payment status (spec §11.1 blocking rule)
// before allowing the Draft -> Pending Approval transition, then fans out to
// Finance/Sales Manager/CEO for concurrent approval.
router.post(
  "/:tenderId/submit-for-approval",
  requireRole("BIDDER", "ADMIN"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await prisma.tender.findUnique({
      where: { id: req.params.tenderId },
      include: { emdRequirement: { include: { emdPayment: true } }, opportunityDetails: true },
    });
    if (!tender || !tender.opportunityDetails) throw new HttpError(404, "Opportunity not found");
    if (!canTransitionOpportunity(tender.opportunityStatus as any, "PENDING_APPROVAL")) {
      throw new HttpError(400, `Cannot submit for approval from status ${tender.opportunityStatus}`);
    }

    const emdOk = canOpportunityEnterApproval({
      emdRequired: tender.emdRequirement?.emdRequired ?? false,
      emdPaymentStatus: tender.emdRequirement?.emdPayment?.status as any,
    });
    if (!emdOk) {
      throw new HttpError(400, "EMD payment must be verified as PAID before the bid can be submitted for approval");
    }

    const [updatedTender] = await prisma.$transaction([
      prisma.tender.update({ where: { id: tender.id }, data: { opportunityStatus: "PENDING_APPROVAL" } }),
      prisma.approvalRecord.upsert({
        where: { opportunityId: tender.opportunityDetails.id },
        update: { overallStatus: "PENDING" },
        create: { opportunityId: tender.opportunityDetails.id, overallStatus: "PENDING" },
      }),
    ]);

    await recordAudit(req, "UPDATE", "Tender", updatedTender.id, { opportunityStatus: "PENDING_APPROVAL" });
    res.json(updatedTender);
  })
);

export default router;
