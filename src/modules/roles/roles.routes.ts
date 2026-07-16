import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

// Canonical menu key registry — must stay in sync with frontend/src/layouts/menuRegistry.ts.
// Kept as a validated enum so a typo in the admin UI can't silently create a dead permission.
export const MENU_KEYS = [
  "tenders",
  "my-bids",
  "team-bids",
  "approvals",
  "emd-payments",
  "emd-refunds",
  "emd-summary",
  "ceo-dashboard",
  "customers",
  "users",
  "roles",
  "pqi",
  "interest-criteria",
  "decision-matrices",
] as const;

const roleSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  menuKeys: z.array(z.enum(MENU_KEYS)).default([]),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    res.json(roles);
  })
);

router.get(
  "/menu-keys",
  asyncHandler(async (_req, res) => {
    res.json(MENU_KEYS);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) throw new HttpError(404, "Role not found");
    res.json(role);
  })
);

router.post(
  "/",
  asyncHandler(async (req: any, res) => {
    const data = roleSchema.parse(req.body);
    const role = await prisma.role.create({ data });
    await recordAudit(req, "CREATE", "Role", role.id, data);
    res.status(201).json(role);
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req: any, res) => {
    const data = roleSchema.partial().parse(req.body);
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Role not found");
    // System roles (seeded) are locked by name — backend authorization elsewhere
    // (requireRole("FINANCE"), etc.) keys directly off Role.name, so renaming one
    // would silently break those checks. Description and menuKeys remain editable.
    if (existing.isSystem && data.name && data.name !== existing.name) {
      throw new HttpError(400, "System role names cannot be changed");
    }
    const role = await prisma.role.update({ where: { id: existing.id }, data });
    await recordAudit(req, "UPDATE", "Role", role.id, data);
    res.json(role);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req: any, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new HttpError(404, "Role not found");
    if (role.isSystem) throw new HttpError(400, "System roles cannot be deleted");
    if (role._count.users > 0) throw new HttpError(400, "Cannot delete a role that still has users assigned");
    await prisma.role.delete({ where: { id: role.id } });
    await recordAudit(req, "DELETE", "Role", role.id);
    res.status(204).send();
  })
);

export default router;
