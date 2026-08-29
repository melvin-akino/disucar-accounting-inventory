import { prisma } from "@/lib/prisma";

interface AuditParams {
  action: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  actorName?: string;
  meta?: Record<string, unknown>;
}

/**
 * Write an audit log entry. Never throws — failures are swallowed so that
 * audit logging never breaks the primary operation.
 */
export async function writeAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action:     params.action,
        entityType: params.entityType ?? null,
        entityId:   params.entityId   ?? null,
        actorId:    params.actorId    ?? null,
        actorName:  params.actorName  ?? null,
        meta:       params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  } catch (e) {
    console.error("[audit] write failed:", params.action, e);
  }
}
