import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { canManageTender } from "../../middleware/rbac";
import { recordAudit } from "../../middleware/audit";

const router = Router();
router.use(authenticate);

const taskInclude = {
  assignedUser: { select: { id: true, fullName: true } },
  completedBy: { select: { id: true, fullName: true } },
};

router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    const tasks = await prisma.tenderTask.findMany({
      where: { tenderId: req.params.tenderId },
      include: taskInclude,
      orderBy: { createdAt: "asc" },
    });
    res.json(tasks);
  })
);

// Cross-tender view for the "Task List" menu — tasks assigned to the caller
// (or every task, for Admin), across all tenders.
router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tasks = await prisma.tenderTask.findMany({
      where: req.user!.isAdmin ? {} : { assignedUserId: req.user!.userId },
      include: { ...taskInclude, tender: { select: { id: true, tenderRefNo: true, title: true, tenderSeq: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(tasks);
  })
);

const createSchema = z.object({
  title: z.string().min(1),
  assignedUserId: z.string().nullable().optional(),
  isRequired: z.boolean().default(true),
});

async function assertTenderManageable(req: AuthedRequest, tenderId: string) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId }, select: { bidderId: true, salesExecId: true } });
  if (!tender) throw new HttpError(404, "Tender not found");
  if (!canManageTender(req.user!, tender)) {
    throw new HttpError(403, "Only Admin or the assigned Bidder/Sales Executive can manage tasks");
  }
  return tender;
}

// Bulk-creates one TenderTask per row in the master TaskTemplate list,
// pre-assigned to this tender's Bidder — reassignable individually afterwards.
router.post(
  "/:tenderId/import",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tender = await assertTenderManageable(req, req.params.tenderId);
    const templates = await prisma.taskTemplate.findMany({ orderBy: { createdAt: "asc" } });
    if (templates.length === 0) throw new HttpError(400, "No task templates have been set up yet");

    await prisma.tenderTask.createMany({
      data: templates.map((t) => ({
        tenderId: req.params.tenderId,
        title: t.title,
        isRequired: t.isRequired,
        assignedUserId: tender.bidderId,
      })),
    });
    await recordAudit(req, "CREATE", "TenderTask", req.params.tenderId, { imported: templates.length });

    const tasks = await prisma.tenderTask.findMany({
      where: { tenderId: req.params.tenderId },
      include: taskInclude,
      orderBy: { createdAt: "asc" },
    });
    res.status(201).json(tasks);
  })
);

router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderManageable(req, req.params.tenderId);
    const data = createSchema.parse(req.body);
    const task = await prisma.tenderTask.create({
      data: { tenderId: req.params.tenderId, ...data },
      include: taskInclude,
    });
    await recordAudit(req, "CREATE", "TenderTask", task.id, data);
    res.status(201).json(task);
  })
);

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  assignedUserId: z.string().nullable().optional(),
  isRequired: z.boolean().optional(),
});

router.patch(
  "/:tenderId/:taskId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const task = await prisma.tenderTask.findUnique({ where: { id: req.params.taskId } });
    if (!task || task.tenderId !== req.params.tenderId) throw new HttpError(404, "Task not found");
    const data = updateSchema.parse(req.body);
    await assertTenderManageable(req, req.params.tenderId);
    const updated = await prisma.tenderTask.update({
      where: { id: task.id },
      data,
      include: taskInclude,
    });
    await recordAudit(req, "UPDATE", "TenderTask", updated.id, data);
    res.json(updated);
  })
);

const completeSchema = z.object({ comment: z.string().trim().optional().default("") });

// Only the task's own assigned user (or Admin) may mark it complete — not the
// tender's Bidder, unless they're also the assignee. A comment is mandatory
// and is recorded in the tender's Comments log, tagged with this task's id.
router.post(
  "/:tenderId/:taskId/complete",
  asyncHandler(async (req: AuthedRequest, res) => {
    const task = await prisma.tenderTask.findUnique({ where: { id: req.params.taskId } });
    if (!task || task.tenderId !== req.params.tenderId) throw new HttpError(404, "Task not found");
    if (!req.user!.isAdmin && task.assignedUserId !== req.user!.userId) {
      throw new HttpError(403, "Only the assigned user can complete this task");
    }
    const { comment } = completeSchema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, select: { stage: true, status: true } });
    if (!tender) throw new HttpError(404, "Tender not found");

    const [updated] = await prisma.$transaction([
      prisma.tenderTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedById: req.user!.userId, completedDate: new Date() },
        include: taskInclude,
      }),
      prisma.comment.create({
        data: {
          tenderId: req.params.tenderId,
          userId: req.user!.userId,
          message: comment,
          stage: tender.stage,
          status: tender.status,
          taskId: task.id,
        },
      }),
    ]);
    await recordAudit(req, "UPDATE", "TenderTask", updated.id, { status: "COMPLETED" });
    res.json(updated);
  })
);

router.delete(
  "/:tenderId/:taskId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const task = await prisma.tenderTask.findUnique({ where: { id: req.params.taskId } });
    if (!task || task.tenderId !== req.params.tenderId) throw new HttpError(404, "Task not found");
    await assertTenderManageable(req, req.params.tenderId);
    await prisma.tenderTask.delete({ where: { id: task.id } });
    await recordAudit(req, "DELETE", "TenderTask", task.id);
    res.status(204).send();
  })
);

export default router;
