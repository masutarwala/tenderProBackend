import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../utils/password";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  roleId: z.string().min(1),
  department: z.string().optional(),
  managerId: z.string().optional(),
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
        roleId: true,
        role: { select: { id: true, name: true } },
        department: true,
        managerId: true,
        active: true,
        createdAt: true,
      },
    });
    res.json(users);
  })
);

router.post(
  "/",
  asyncHandler(async (req: any, res) => {
    const { password, ...data } = createSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { ...data, passwordHash },
      include: { role: { select: { name: true } } },
    });
    await recordAudit(req, "CREATE", "User", user.id);
    res.status(201).json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role.name });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req: any, res) => {
    const data = updateSchema.parse(req.body);
    const { password, ...rest } = data;
    const updateData: any = { ...rest };
    if (password) updateData.passwordHash = await hashPassword(password);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      include: { role: { select: { name: true } } },
    });
    await recordAudit(req, "UPDATE", "User", user.id, data);
    res.json({ id: user.id, email: user.email, fullName: user.fullName, role: user.role.name, active: user.active });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: any, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    await recordAudit(req, "DELETE", "User", req.params.id);
    res.status(204).send();
  })
);

export default router;
