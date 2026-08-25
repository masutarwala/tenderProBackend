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
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    res.json(tasks);
  })
);

// Cross-tender view for the "My Tasks" menu. Admin sees every task. Everyone
// else sees: every task assigned to them directly, PLUS — for any tender
// where they are the Bidder — every task on that tender regardless of
// assignee (the Bidder can see the whole bid's task list like their own,
// just not complete tasks that aren't theirs — that stays enforced by the
// /complete endpoint below). A non-Bidder assignee only ever sees their own
// tasks, on any tender.
router.get(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const tasks = await prisma.tenderTask.findMany({
      where: req.user!.isAdmin
        ? {}
        : { OR: [{ assignedUserId: req.user!.userId }, { tender: { bidderId: req.user!.userId } }] },
      include: { ...taskInclude, tender: { select: { id: true, tenderRefNo: true, title: true, tenderSeq: true, closingDate: true, stage: true } } },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });
    res.json(tasks);
  })
);

const stageEnum = z.enum(["EVALUATION", "PREPARATION", "SUBMISSION"]);

const createSchema = z.object({
  title: z.string().min(1),
  assignedUserId: z.string().nullable().optional(),
  isRequired: z.boolean().default(true),
  stage: stageEnum.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  order: z.number().int().optional(),
});

// Next order value for a manually-added task — appends to the end of the
// tender's existing list rather than defaulting to 0 (which would collide
// with whatever's already first).
async function nextTaskOrder(tenderId: string): Promise<number> {
  const last = await prisma.tenderTask.aggregate({ where: { tenderId }, _max: { order: true } });
  return (last._max.order ?? -1) + 1;
}

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
    const templates = await prisma.taskTemplate.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
    if (templates.length === 0) throw new HttpError(400, "No task templates have been set up yet");

    // `idx` is each template's actual position in the (order asc, createdAt
    // asc) list above — always use it, not the raw template.order value,
    // which defaults to 0 for every never-drag-reordered template and would
    // otherwise collapse every imported task onto the same order.
    await prisma.tenderTask.createMany({
      data: templates.map((t, idx) => ({
        tenderId: req.params.tenderId,
        title: t.title,
        isRequired: t.isRequired,
        stage: t.stage,
        order: idx,
        dateRequired: t.dateRequired,
        dueDate: null,
        assignedUserId: tender.bidderId,
      })),
    });
    await recordAudit(req, "CREATE", "TenderTask", req.params.tenderId, { imported: templates.length });

    const tasks = await prisma.tenderTask.findMany({
      where: { tenderId: req.params.tenderId },
      include: taskInclude,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    res.status(201).json(tasks);
  })
);

// Drag-and-drop task reordering endpoint
router.post(
  "/:tenderId/reorder",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderManageable(req, req.params.tenderId);
    const { taskIds } = z.object({ taskIds: z.array(z.string()) }).parse(req.body);
    await prisma.$transaction(
      taskIds.map((id, index) =>
        prisma.tenderTask.update({ where: { id }, data: { order: index } })
      )
    );
    res.status(200).json({ success: true });
  })
);

router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    await assertTenderManageable(req, req.params.tenderId);
    const data = createSchema.parse(req.body);
    const order = data.order ?? (await nextTaskOrder(req.params.tenderId));
    // A manually-added task with a due date is treated the same as an
    // imported dateRequired one — otherwise My Tasks' Task Date column (and
    // the editable date picker on the tender's own Task List) never picks it
    // up, since both key off dateRequired rather than dueDate being set.
    const dateRequired = data.dueDate != null;
    const task = await prisma.tenderTask.create({
      data: { tenderId: req.params.tenderId, ...data, order, dateRequired },
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
  stage: stageEnum.nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  order: z.number().int().optional(),
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

const dueDateSchema = z.object({ dueDate: z.coerce.date() });

// Dedicated endpoint for setting/editing a dateRequired task's due date —
// open to the assigned user (not just Admin/Bidder/Sales Exec), upcoming
// dates only, and locked once the task is completed.
router.patch(
  "/:tenderId/:taskId/due-date",
  asyncHandler(async (req: AuthedRequest, res) => {
    const task = await prisma.tenderTask.findUnique({ where: { id: req.params.taskId } });
    if (!task || task.tenderId !== req.params.tenderId) throw new HttpError(404, "Task not found");
    if (!task.dateRequired) throw new HttpError(400, "This task does not require a due date");
    if (task.status === "COMPLETED") throw new HttpError(400, "Cannot change the due date of a completed task");

    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, select: { bidderId: true, salesExecId: true } });
    if (!tender) throw new HttpError(404, "Tender not found");
    if (!canManageTender(req.user!, tender) && task.assignedUserId !== req.user!.userId) {
      throw new HttpError(403, "Only the assigned user or tender manager can set this task's due date");
    }

    const { dueDate } = dueDateSchema.parse(req.body);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate.getTime() < today.getTime()) {
      throw new HttpError(400, "Due date must be today or a future date");
    }

    const updated = await prisma.tenderTask.update({
      where: { id: task.id },
      data: { dueDate },
      include: taskInclude,
    });
    await recordAudit(req, "UPDATE", "TenderTask", updated.id, { dueDate });
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
