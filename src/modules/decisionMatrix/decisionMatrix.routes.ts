import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const criterionSchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).max(100),
  scoringScaleMax: z.number().int().min(1).default(10),
  autoCalculated: z.boolean().default(false),
});

const matrixSchema = z.object({
  name: z.string().min(1),
  shortlistThreshold: z.number().min(0).max(100).default(60),
  criteria: z.array(criterionSchema).min(1),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.decisionMatrix.findMany({ include: { criteria: true }, orderBy: { createdAt: "desc" } }));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const matrix = await prisma.decisionMatrix.findUnique({ where: { id: req.params.id }, include: { criteria: true } });
    if (!matrix) throw new HttpError(404, "Decision matrix not found");
    res.json(matrix);
  })
);

router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req: any, res) => {
    const data = matrixSchema.parse(req.body);
    const totalWeight = data.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (Math.round(totalWeight) !== 100) {
      throw new HttpError(400, `Criteria weights must total 100 (got ${totalWeight})`);
    }
    const matrix = await prisma.decisionMatrix.create({
      data: {
        name: data.name,
        shortlistThreshold: data.shortlistThreshold,
        criteria: { create: data.criteria },
      },
      include: { criteria: true },
    });
    await recordAudit(req, "CREATE", "DecisionMatrix", matrix.id);
    res.status(201).json(matrix);
  })
);

router.patch(
  "/:id/active",
  requireRole("ADMIN"),
  asyncHandler(async (req: any, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const matrix = await prisma.decisionMatrix.update({ where: { id: req.params.id }, data: { active } });
    await recordAudit(req, "UPDATE", "DecisionMatrix", matrix.id, { active });
    res.json(matrix);
  })
);

export default router;
