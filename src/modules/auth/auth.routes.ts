import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function serializeUser(user: { id: string; email: string; fullName: string; isAdmin: boolean; canAddTender: boolean; menuKeys: string[] }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isAdmin: user.isAdmin,
    canAddTender: user.canAddTender,
    menuKeys: user.menuKeys,
  };
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new HttpError(401, "Invalid email or password");
    if (!user.active) throw new HttpError(403, "Your account has been deactivated. Please contact an admin.");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password");
    const token = signToken({ userId: user.id, isAdmin: user.isAdmin });
    res.json({ token, user: serializeUser(user) });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new HttpError(404, "User not found");
    res.json(serializeUser(user));
  })
);

export default router;
