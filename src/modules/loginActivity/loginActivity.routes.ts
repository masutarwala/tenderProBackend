import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/rbac";

const router = Router();
router.use(authenticate, requireAdmin());

// Admin-only, paginated. Optional ?userId filters to one user's activity.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req.query as { userId?: string };
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));

    const where = userId ? { userId } : {};
    const [items, total] = await Promise.all([
      prisma.loginActivity.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.loginActivity.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  })
);

export default router;
