import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  tenderId: z.string().min(1),
  side: z.enum(["TO_CLIENT", "FROM_CLIENT"]),
  title: z.string().trim().optional(),
  url: z.string().trim().url("Enter a valid URL"),
});

// Per-tender documents, two tabs only: To Client / From Client. A document
// is just a pasted link now — no file upload/storage. Clicking it in the UI
// opens the URL directly in a new tab.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { tenderId } = req.query as { tenderId?: string };
    if (!tenderId) throw new HttpError(400, "tenderId is required");
    res.json(
      await prisma.document.findMany({
        where: { tenderId },
        include: { uploadedBy: { select: { fullName: true } } },
        orderBy: { uploadedAt: "desc" },
      })
    );
  })
);

router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { tenderId, side, title, url } = createSchema.parse(req.body);

    const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new HttpError(404, "Tender not found");

    const doc = await prisma.document.create({
      data: { tenderId, side, title: title?.trim() || null, url, uploadedById: req.user!.userId },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    res.status(201).json(doc);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  })
);

export default router;
