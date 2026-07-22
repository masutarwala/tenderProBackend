import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";
import { CHECKLIST_DEFINITION } from "../evaluation/evaluation.routes";

const router = Router();
router.use(authenticate, requireRole("ADMIN", "BIDDER"));

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
// Merges the fixed CHECKLIST_DEFINITION steps (built into every tender's checklist,
// not stored in the DB) with the admin/bidder-authored MasterChecklistItem template
// rows, so the config page shows the full picture of what a new tender's checklist
// will contain. System rows are synthetic (id "system-<phase>-<order>") and read-only.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.masterChecklistItem.findMany({
      orderBy: [{ phase: "asc" }, { order: "asc" }],
    });

    const systemItems = CHECKLIST_DEFINITION.filter(
      (d) => d.phase === "EVALUATION" || d.phase === "PREPARATION"
    ).map((d) => ({
      id: `system-${d.phase}-${d.order}`,
      phase: d.phase,
      label: d.label,
      order: d.order,
      isDefault: true,
      isSystem: true,
    }));

    res.json([...systemItems, ...items.map((i) => ({ ...i, isSystem: false }))]);
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
    if (items.some((i) => i.id.startsWith("system-"))) throw new HttpError(400, "System checklist steps cannot be reordered");

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
    if (req.params.id.startsWith("system-")) throw new HttpError(400, "System checklist steps cannot be edited");
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
    if (req.params.id.startsWith("system-")) throw new HttpError(400, "System checklist steps cannot be deleted");
    const item = await prisma.masterChecklistItem.delete({
      where: { id: req.params.id },
    });

    await recordAudit(req as any, "DELETE", "MasterChecklistItem", item.id);
    res.json(item);
  })
);

export default router;
