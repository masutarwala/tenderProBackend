import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";

const router = Router();
router.use(authenticate);

const commentInclude = {
  user: { select: { id: true, fullName: true, isAdmin: true } },
  task: { select: { id: true, title: true } },
};

router.get(
  "/:tenderId",
  asyncHandler(async (req, res) => {
    const comments = await prisma.comment.findMany({
      where: { tenderId: req.params.tenderId },
      include: commentInclude,
      orderBy: { createdAt: "asc" },
    });
    res.json(comments);
  })
);

const createSchema = z.object({ message: z.string().trim().min(1) });

router.post(
  "/:tenderId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { message } = createSchema.parse(req.body);
    const tender = await prisma.tender.findUnique({ where: { id: req.params.tenderId }, select: { stage: true, status: true } });
    if (!tender) throw new HttpError(404, "Tender not found");
    const comment = await prisma.comment.create({
      data: { tenderId: req.params.tenderId, userId: req.user!.userId, message, stage: tender.stage, status: tender.status },
      include: commentInclude,
    });
    res.status(201).json(comment);
  })
);

export default router;
