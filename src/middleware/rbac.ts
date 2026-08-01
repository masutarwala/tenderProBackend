import { NextFunction, Response } from "express";
import { AuthedRequest } from "./auth";

// RBAC removed: the only backend-enforced distinction is Admin vs everyone
// else. "Admin or the assigned Bidder/Sales Exec" checks are data-dependent
// (which tender), so they're done inline at each call site via
// canManageTender below rather than as generic middleware.
export function requireAdmin() {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Requires admin" });
    }
    next();
  };
}

// Admin, the assigned Bidder, and the assigned Sales Executive all have equal
// edit rights on a tender (fields, Stage/Status, Outcome, task management).
// Everyone else is read-only except for their own assigned task.
export function canManageTender(
  user: { userId: string; isAdmin: boolean },
  tender: { bidderId: string | null; salesExecId: string | null }
): boolean {
  return user.isAdmin || tender.bidderId === user.userId || tender.salesExecId === user.userId;
}
