import { prisma } from "@/lib/prisma";

/**
 * Uniform, human-readable record codes: PREFIX-YYYYMMDD-NNNN (e.g. SO-20260701-0001).
 * The sequence restarts at 0001 each calendar day, scoped per prefix. Existing records
 * created before this format was introduced keep their old id — this only shapes new ones.
 */
export async function nextCode(prefix: string, countCreatedToday: (since: Date) => Promise<number>): Promise<string> {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  const seq = (await countCreatedToday(midnight)) + 1;
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(4, "0")}`;
}

/** Next journal entry id. Shared by the ledger and the counter till. */
export function jeId() {
  return nextCode("JE", (since) =>
    prisma.journalEntry.count({ where: { createdAt: { gte: since } } })
  );
}

/** Days from a payment-terms string ("Net 30" -> 30). Defaults to 30. */
export function parseDays(terms: string): number {
  const m = terms.match(/\d+/);
  return m ? parseInt(m[0]) : 30;
}
