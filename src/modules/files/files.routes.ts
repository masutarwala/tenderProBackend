import { Router } from "express";
import multer from "multer";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate } from "../../middleware/auth";
import { fileService, MAX_UPLOAD_BYTES } from "../../services/fileService";

const router = Router();
router.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function uploadSingle(field: string) {
  return (req: any, res: any, next: any) => {
    upload.single(field)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return next(new HttpError(400, `File exceeds maximum allowed size of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`));
      }
      if (err) return next(err);
      next();
    });
  };
}

// Stage 1 of the two-step upload: stash the file under /temp/uploads and
// hand back its path. Nothing touches Cloudinary or the database yet — that
// only happens once the owning record (a Document) is actually saved.
router.post(
  "/upload-temp",
  uploadSingle("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "file is required");
    const result = await fileService.uploadTemp(req.file);
    res.status(201).json({
      success: true,
      fileName: result.fileName,
      localPath: result.localPath,
      originalName: result.originalName,
    });
  })
);

export default router;
