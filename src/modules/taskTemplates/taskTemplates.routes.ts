import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/rbac";

const router = Router();
router.use(authenticate);

const stageEnum = z.enum(["EVALUATION", "PREPARATION", "SUBMISSION"]);

// Readable by anyone (needed for the "Import Tasks" picker on the tender
// detail page); only Admin maintains the master list itself.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.taskTemplate.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
    res.json(templates);
  })
);

const upsertSchema = z.object({
  title: z.string().trim().min(1),
  isRequired: z.boolean().default(true),
  stage: stageEnum.nullable().optional(),
  dueDaysOffset: z.number().int().nullable().optional(),
  order: z.number().int().optional(),
});

router.post(
  "/reorder",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const { templateIds } = z.object({ templateIds: z.array(z.string()) }).parse(req.body);
    await prisma.$transaction(
      templateIds.map((id, index) =>
        prisma.taskTemplate.update({ where: { id }, data: { order: index } })
      )
    );
    res.status(200).json({ success: true });
  })
);

router.post(
  "/",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const data = upsertSchema.parse(req.body);
    const template = await prisma.taskTemplate.create({ data });
    res.status(201).json(template);
  })
);

router.patch(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const data = upsertSchema.partial().parse(req.body);
    const template = await prisma.taskTemplate.update({ where: { id: req.params.id }, data });
    res.json(template);
  })
);

router.delete(
  "/:id",
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const template = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw new HttpError(404, "Template not found");
    await prisma.taskTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
