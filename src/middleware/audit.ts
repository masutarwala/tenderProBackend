import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

export async function recordAudit(
  req: AuthedRequest,
  action: "CREATE" | "UPDATE" | "DELETE",
  resourceType: string,
  resourceId?: string,
  diff?: unknown
) {
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId,
      action,
      resourceType,
      resourceId,
      diff: diff ? JSON.stringify(diff) : undefined,
      ipAddress: req.ip,
    },
  });
}
