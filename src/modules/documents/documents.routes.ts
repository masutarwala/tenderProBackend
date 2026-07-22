import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { storageAdapter } from "../../storage/localDiskStorage";

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Tender-phase documents are tagged category="<phase>:<role>" (see TenderUpdatePage's
// DocumentsCard). Once that phase is actually completed, its documents become a
// closed record — mirrors the frontend's phaseLocked logic and the same rule
// already enforced for StageApproval.
async function assertTenderPhaseUnlocked(entityType: string, entityId: string, category?: string | null) {
  if (entityType !== "Tender" || !category) return;
  const phase = category.split(":")[0];
  if (phase !== "EVALUATION" && phase !== "PREPARATION") return;
  const tender = await prisma.tender.findUnique({ where: { id: entityId }, select: { bidStage: true } });
  if (!tender) return;
  const locked =
    (phase === "EVALUATION" && tender.bidStage !== "EVALUATION") ||
    (phase === "PREPARATION" && (tender.bidStage === "SUBMISSION" || tender.bidStage === "CLOSED"));
  if (locked) throw new HttpError(400, "This stage is complete — documents are locked.");
}

// entityType/entityId let any module (Tender, OpportunityDetails, EmdPayment, EmdRefund, PqiStatement)
// attach documents without a bespoke upload endpoint of its own.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) throw new HttpError(400, "entityType and entityId are required");
    res.json(
      await prisma.document.findMany({
        where: { entityType, entityId },
        include: { uploadedBy: { select: { fullName: true, role: { select: { name: true } } } } },
        orderBy: { uploadedAt: "desc" },
      })
    );
  })
);

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { entityType, entityId, category, title } = req.body as { entityType?: string; entityId?: string; category?: string; title?: string };
    if (!entityType || !entityId) throw new HttpError(400, "entityType and entityId are required");
    if (!req.file) throw new HttpError(400, "file is required");
    await assertTenderPhaseUnlocked(entityType, entityId, category);

    const stored = await storageAdapter.upload(`${entityType}/${entityId}`, req.file.originalname, req.file.buffer, req.file.mimetype);
    const doc = await prisma.document.create({
      data: {
        entityType,
        entityId,
        category,
        title: title?.trim() || null,
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
    await assertTenderPhaseUnlocked(doc.entityType, doc.entityId, doc.category);
    await storageAdapter.delete(doc.storageKey);
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  })
);

export default router;
