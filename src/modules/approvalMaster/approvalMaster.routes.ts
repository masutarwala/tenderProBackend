import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate, requireRole("ADMIN", "BIDDER"));

const PHASES = ["EVALUATION", "PREPARATION"] as const;

const createSchema = z.object({
  phase: z.enum(PHASES),
  title: z.string().min(1),
  roleId: z.string().min(1),
  required: z.boolean().default(true),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  roleId: z.string().min(1).optional(),
  required: z.boolean().optional(),
});

const roleInclude = { role: { select: { id: true, name: true } } };

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.masterApprovalItem.findMany({
      include: roleInclude,
      orderBy: [{ phase: "asc" }, { createdAt: "asc" }],
    });
    res.json(items);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const item = await prisma.masterApprovalItem.create({ data, include: roleInclude });
    await recordAudit(req as any, "CREATE", "MasterApprovalItem", item.id, data);
    res.status(201).json(item);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const item = await prisma.masterApprovalItem.update({ where: { id: req.params.id }, data, include: roleInclude });
    await recordAudit(req as any, "UPDATE", "MasterApprovalItem", item.id, data);
    res.json(item);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.masterApprovalItem.delete({ where: { id: req.params.id } });
    await recordAudit(req as any, "DELETE", "MasterApprovalItem", item.id);
    res.json(item);
  })
);

export default router;
