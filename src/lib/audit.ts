import { prisma } from "./db";
import type { Session } from "./auth";

export async function audit(
  session: Session,
  action: string,
  entity: string,
  entityId?: number | null,
  details?: string
) {
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      impersonatorId: session.impersonator?.id ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      details: details?.slice(0, 2000) ?? null,
    },
  });
}
