import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { storageAdapter } from "../../storage/localDiskStorage";

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// entityType/entityId let any module (Tender, OpportunityDetails, EmdPayment, EmdRefund, PqiStatement)
// attach documents without a bespoke upload endpoint of its own.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) throw new HttpError(400, "entityType and entityId are required");
    res.json(await prisma.document.findMany({ where: { entityType, entityId }, orderBy: { uploadedAt: "desc" } }));
  })
);

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { entityType, entityId, category } = req.body as { entityType?: string; entityId?: string; category?: string };
    if (!entityType || !entityId) throw new HttpError(400, "entityType and entityId are required");
    if (!req.file) throw new HttpError(400, "file is required");

    const stored = await storageAdapter.upload(`${entityType}/${entityId}`, req.file.originalname, req.file.buffer, req.file.mimetype);
    const doc = await prisma.document.create({
      data: {
        entityType,
        entityId,
        category,
        fileName: stored.fileName,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        uploadedById: req.user!.userId,
      },
    });
    res.status(201).json(doc);
  })
);

router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    const buffer = await storageAdapter.download(doc.storageKey);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName}"`);
    if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
    res.send(buffer);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    await storageAdapter.delete(doc.storageKey);
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  })
);

export default router;
