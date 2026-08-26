import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../utils/password";
import { signToken, verifyTokenIgnoreExpiration } from "../../utils/jwt";
import { asyncHandler, HttpError } from "../../middleware/errorHandler";
import { authenticate, AuthedRequest } from "../../middleware/auth";
import { LoginActivityType } from "@prisma/client";

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

function recordLoginActivity(data: { userId?: string | null; email: string; type: LoginActivityType; ipAddress?: string | null }) {
  return prisma.loginActivity.create({ data }).catch((err) => console.error("Failed to record login activity", err));
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const ipAddress = req.ip;
    const user = await prisma.user.findUnique({ where: { email } });
    // Failed attempts are logged without a userId — even when the email did
    // match an account — and record the attempted email/password together
    // so an admin can see exactly what was typed.
    const failedAttempt = () => recordLoginActivity({ email: `${email} / ${password}`, type: "LOGIN_FAILED", ipAddress });

    if (!user) {
      await failedAttempt();
      throw new HttpError(401, "Invalid email or password");
    }
    if (!user.active) {
      await failedAttempt();
      throw new HttpError(403, "Your account has been deactivated. Please contact an admin.");
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await failedAttempt();
      throw new HttpError(401, "Invalid email or password");
    }

    await recordLoginActivity({ userId: user.id, email, type: "LOGIN_SUCCESS", ipAddress });
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

// User-initiated logout — records a plain LOGOUT, distinct from the
// server-forced SESSION_EXPIRED below.
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (user) await recordLoginActivity({ userId: user.id, email: user.email, type: "LOGOUT", ipAddress: req.ip });
    res.status(204).send();
  })
);

// Called by the frontend the moment it detects a 401 from an expired token —
// verifies the token's signature (ignoring expiration) so we know who it
// belonged to, then logs a forced SESSION_EXPIRED logout. Deliberately not
// behind `authenticate`, since the whole point is the token has expired.
router.post(
  "/session-expired",
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(400, "Missing token");
    let payload;
    try {
      payload = verifyTokenIgnoreExpiration(header.slice("Bearer ".length));
    } catch {
      throw new HttpError(400, "Invalid token");
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (user) await recordLoginActivity({ userId: user.id, email: user.email, type: "SESSION_EXPIRED", ipAddress: req.ip });
    res.status(204).send();
  })
);

export default router;
