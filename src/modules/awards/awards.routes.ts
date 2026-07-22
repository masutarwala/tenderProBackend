import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    res.json(await prisma.awardFormalities.findUnique({ where: { tenderId: req.params.tenderId } }));
  })
);

const awardFormalitiesSchema = z.object({
  contractSigned: z.boolean().optional(),
  contractSignedDate: z.coerce.date().nullable().optional(),
  poReceived: z.boolean().optional(),
  poNumber: z.string().nullable().optional(),
  poDate: z.coerce.date().nullable().optional(),
  poValue: z.number().nullable().optional(),
  bgRequired: z.boolean().optional(),
  bgIssued: z.boolean().optional(),
  bgAmount: z.number().nullable().optional(),
  bgBankName: z.string().nullable().optional(),
  bgValidityDate: z.coerce.date().nullable().optional(),
  formalitiesComplete: z.boolean().optional(),
});

// Formalities (contract/PO/BG) only make sense once a tender is actually WON.
router.put(
  "/:tenderId",
  requireRole("CEO", "SALES_MANAGER", "ADMIN", "FINANCE"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = awardFormalitiesSchema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, include: { outcomeRecord: true } });
    if (!tender) throw new HttpError(404, "Tender not found");
    if (tender.outcomeRecord?.outcome !== "WON") {
      throw new HttpError(400, "Tender must be recorded as WON before tracking award formalities");
    }

    const record = await prisma.awardFormalities.upsert({
      where: { tenderId: req.params.tenderId },
      update: { ...data, updatedById: req.user!.userId },
      create: { tenderId: req.params.tenderId, ...data, updatedById: req.user!.userId },
    });
    await recordAudit(req, "UPDATE", "AwardFormalities", record.id, data);
    res.json(record);
  })
);

export default router;
