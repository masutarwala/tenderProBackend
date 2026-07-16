import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const schema = z.object({
  qualificationAssessment: z.boolean().optional(),
  interestFitScore: z.number().optional(),
  itemDetails: z.string().optional(),
  deliveryLocation: z.string().optional(),
  deliveryPeriod: z.string().optional(),
  paymentTermsExtracted: z.string().optional(),
  statutoryNotes: z.string().optional(),
  evaluatorNotes: z.string().optional(),
  shortlistRecommendation: z.boolean().optional(),
});

router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    res.json(await prisma.preliminaryTenderInfo.findUnique({ where: { tenderId: req.params.tenderId } }));
  })
);

router.put(
  "/:tenderId",
  requireRole("EVALUATOR", "EXTRACTOR", "ADMIN"),
  asyncHandler(async (req: any, res) => {
    const data = schema.parse(req.body);
    const record = await prisma.preliminaryTenderInfo.upsert({
      where: { tenderId: req.params.tenderId },
      update: data,
      create: { tenderId: req.params.tenderId, ...data },
    });
    await recordAudit(req, "UPDATE", "PreliminaryTenderInfo", record.id, data);
    res.json(record);
  })
);

export default router;
