import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { fileService } from "../../services/fileService";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  tenderId: z.string().min(1),
  side: z.enum(["TO_CLIENT", "FROM_CLIENT"]),
  title: z.string().optional(),
  documentPath: z.string().min(1),
});

// Per-tender documents, two tabs only: To Client / From Client. Nothing is
// locked/gated anymore — Stage/Status changes are manual, not workflow-gated.
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

// Finalizes a file previously staged via POST /api/files/upload-temp: moves
// it to Cloudinary, records the URL, then clears the temp copy. The file
// itself never lands on Cloudinary until this step, so an abandoned form
// (user picks a file, never saves) leaves nothing but a temp-dir file that
// the next server restart sweeps up.
router.post(
  "/",
  asyncHandler(async (req: AuthedRequest, res) => {
    const { tenderId, side, title, documentPath } = createSchema.parse(req.body);

    if (!(await fileService.fileExists(documentPath))) {
      throw new HttpError(400, "Uploaded file was not found on the server. Please re-upload and try again.");
    }
    const meta = await fileService.readTempMeta(documentPath);

    const folder = `client-documents/${side === "TO_CLIENT" ? "to-client" : "from-client"}`;
    let uploaded;
    try {
      uploaded = await fileService.uploadToCloudinary(documentPath, folder);
    } catch (err) {
      console.error("Cloudinary upload failed", err);
      throw new HttpError(502, "Failed to upload document to cloud storage. Please try again.");
    }

    let doc;
    try {
      doc = await prisma.document.create({
        data: {
          tenderId,
          side,
          title: title?.trim() || null,
          fileName: meta.originalName,
          url: uploaded.secureUrl,
          publicId: uploaded.publicId,
          resourceType: uploaded.resourceType,
          mimeType: meta.mimeType,
          sizeBytes: meta.sizeBytes,
          uploadedById: req.user!.userId,
        },
      });
    } catch (err) {
      await fileService.deleteCloudinaryFile(uploaded.publicId, uploaded.resourceType).catch(() => {});
      throw err;
    }

    await fileService.deleteLocalFile(documentPath).catch((err) => console.error("Failed to clean up temp file", err));

    res.status(201).json(doc);
  })
);

router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    res.redirect(doc.url);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw new HttpError(404, "Document not found");
    await fileService.deleteCloudinaryFile(doc.publicId, doc.resourceType ?? undefined).catch((err) => console.error("Failed to delete Cloudinary file", err));
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  })
);

export default router;
