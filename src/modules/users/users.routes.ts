import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../utils/password";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

// Canonical menu key set — must stay in sync with frontend/src/layouts/menuRegistry.ts.
export const MENU_KEYS = ["dashboard", "my-bids", "users", "task-list"] as const;

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  isAdmin: z.boolean().default(false),
  menuKeys: z.array(z.enum(MENU_KEYS)).default([]),
});

const updateSchema = createSchema.partial().omit({ password: true }).extend({
  password: z.string().min(8).optional(),
  active: z.boolean().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        isAdmin: true,
        menuKeys: true,
        active: true,
        createdAt: true,
      },
    });
    res.json(users);
  })
);

router.post(
  "/",
  requireAdmin(),
  asyncHandler(async (req: any, res) => {
    const { password, ...data } = createSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { ...data, passwordHash } });
    await recordAudit(req, "CREATE", "User", user.id);
    res.status(201).json({ id: user.id, email: user.email, fullName: user.fullName, isAdmin: user.isAdmin });
  })
);

router.patch(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req: any, res) => {
    const data = updateSchema.parse(req.body);
    const { password, ...rest } = data;
    const updateData: any = { ...rest };
    if (password) updateData.passwordHash = await hashPassword(password);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
    await recordAudit(req, "UPDATE", "User", user.id, data);
    res.json({ id: user.id, email: user.email, fullName: user.fullName, isAdmin: user.isAdmin, active: user.active });
  })
);

router.delete(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req: any, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    await recordAudit(req, "DELETE", "User", req.params.id);
    res.status(204).send();
  })
);

export default router;
