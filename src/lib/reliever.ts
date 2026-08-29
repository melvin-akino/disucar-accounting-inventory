import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/**
 * True if `userId` currently holds an active reliever grant covering `requiredRole`,
 * i.e. an assignment where they are the reliever, the covered role matches, and today
 * falls within [startDate, endDate]. Used to unlock role-gated actions for a stand-in
 * during someone's absence (item 11).
 *
 * Pure lookup, no side effects — call it as an OR alongside the normal role check:
 *   allowed.includes(role) || await hasActiveReliefGrant(userId, "WAREHOUSE")
 */
export async function hasActiveReliefGrant(userId: string, requiredRole: Role): Promise<boolean> {
  const now = new Date();
  const grant = await prisma.relieverAssignment.findFirst({
    where: {
      relieverUserId: userId,
      coveredRole: requiredRole,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: { id: true },
  });
  return grant !== null;
}
