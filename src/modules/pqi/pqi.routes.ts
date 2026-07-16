import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const pqiSchema = z.object({
  effectiveDate: z.coerce.date(),
  qualifications: z.string(),
  technicalCapabilities: z.string(),
  financialStanding: z.string(),
  industryExperience: z.string(),
  govtRegistrations: z.string().optional(),
  isoCertifications: z.string().optional(),
});

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.pqiStatement.findMany({ orderBy: { version: "desc" } }));
  })
);

router.get(
  "/active",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.pqiStatement.findFirst({ where: { active: true }, orderBy: { version: "desc" } }));
  })
);

// New submission creates the next version and marks it active; prior versions
// stay in history (spec §2.1 PQI Statement: "Version history with effective dates").
router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req: any, res) => {
    const data = pqiSchema.parse(req.body);
    const latest = await prisma.pqiStatement.findFirst({ orderBy: { version: "desc" } });
    const nextVersion = (latest?.version ?? 0) + 1;
    await prisma.pqiStatement.updateMany({ where: { active: true }, data: { active: false } });
    const created = await prisma.pqiStatement.create({ data: { ...data, version: nextVersion, active: true } });
    await recordAudit(req, "CREATE", "PqiStatement", created.id);
    res.status(201).json(created);
  })
);

export default router;
