import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { canTransitionOpportunity } from "../../utils/tenderStateMachine";

const router = Router();
router.use(authenticate);

const schema = z.object({
  submittedTo: z.string().min(1),
  submissionProofKey: z.string().optional(),
});

router.post(
  "/:tenderId",
  requireRole("BIDDER"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = schema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, include: { opportunityDetails: true } });
    if (!tender || !tender.opportunityDetails) throw new HttpError(404, "Opportunity not found");
    if (!canTransitionOpportunity(tender.opportunityStatus as any, "BID")) {
      throw new HttpError(400, `Cannot submit bid from status ${tender.opportunityStatus}`);
    }

    const submission = await prisma.bidSubmission.upsert({
      where: { opportunityId: tender.opportunityDetails.id },
      update: { ...data, submittedAt: new Date() },
      create: { opportunityId: tender.opportunityDetails.id, ...data, submittedAt: new Date() },
    });
    await prisma.tender.update({ where: { id: tender.id }, data: { opportunityStatus: "BID", bidStage: "CLOSED" } });

    await recordAudit(req, "CREATE", "BidSubmission", submission.id);
    res.status(201).json(submission);
  })
);

export default router;
