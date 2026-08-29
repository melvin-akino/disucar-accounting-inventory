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
