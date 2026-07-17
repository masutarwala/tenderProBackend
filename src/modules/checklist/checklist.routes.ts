import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const createSchema = z.object({
  phase: z.enum(["EVALUATION", "PREPARATION", "SUBMISSION", "OUTCOME"]),
  label: z.string().min(1),
  isDefault: z.boolean().default(true),
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      order: z.number().int(),
    })
  ),
});

// GET /api/checklist
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.masterChecklistItem.findMany({
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });
    res.json(items);
  })
);

// POST /api/checklist
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { phase, label, isDefault } = createSchema.parse(req.body);

    const agg = await prisma.masterChecklistItem.aggregate({
      where: { phase },
      _max: { order: true },
    });
    const order = (agg._max.order ?? -1) + 1;

    const item = await prisma.masterChecklistItem.create({
      data: { phase, label, order, isDefault },
    });

    await recordAudit(req as any, "CREATE", "MasterChecklistItem", item.id, { phase, label, order, isDefault });
    res.status(201).json(item);
  })
);

// PUT /api/checklist/reorder
router.put(
  "/reorder",
  asyncHandler(async (req, res) => {
    const { items } = reorderSchema.parse(req.body);

    await prisma.$transaction(
      items.map((item) =>
        prisma.masterChecklistItem.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    res.json({ success: true });
  })
);

// PUT /api/checklist/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const item = await prisma.masterChecklistItem.update({
      where: { id: req.params.id },
      data,
    });

    await recordAudit(req as any, "UPDATE", "MasterChecklistItem", item.id, data);
    res.json(item);
  })
);

// DELETE /api/checklist/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.masterChecklistItem.delete({
      where: { id: req.params.id },
    });

    await recordAudit(req as any, "DELETE", "MasterChecklistItem", item.id);
    res.json(item);
  })
);

export default router;
