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
  category: z.string().min(1),
  industryType: z.string().optional(),
  geography: z.string().optional(),
  organizationType: z.string().optional(),
  organizationSizeMin: z.string().optional(),
  organizationSizeMax: z.string().optional(),
  scoringWeight: z.number().min(0).max(100).default(0),
  active: z.boolean().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.interestCriterion.findMany({ orderBy: { category: "asc" } }));
  })
);

router.post(
  "/",
  requireRole("ADMIN", "EVALUATOR"),
  asyncHandler(async (req: any, res) => {
    const data = schema.parse(req.body);
    const created = await prisma.interestCriterion.create({ data });
    await recordAudit(req, "CREATE", "InterestCriterion", created.id);
    res.status(201).json(created);
  })
);

router.patch(
  "/:id",
  requireRole("ADMIN", "EVALUATOR"),
  asyncHandler(async (req: any, res) => {
    const data = schema.partial().parse(req.body);
    const updated = await prisma.interestCriterion.update({ where: { id: req.params.id }, data });
    await recordAudit(req, "UPDATE", "InterestCriterion", updated.id, data);
    res.json(updated);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req: any, res) => {
    await prisma.interestCriterion.delete({ where: { id: req.params.id } });
    await recordAudit(req, "DELETE", "InterestCriterion", req.params.id);
    res.status(204).send();
  })
);

export default router;
