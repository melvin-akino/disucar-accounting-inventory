import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { COA_BY_CODE, inventoryAccountFor, COGS_ACCOUNT } from "@/lib/coa";

/**
 * Every GL code posted anywhere in the app must exist in the chart of accounts.
 *
 * Four codes (1101, 2001, 4001, 5001) were being posted to that were not in the COA at
 * all: credit notes never reduced the real receivable, and inventory write-offs never
 * reached an expense account. Nothing failed loudly — computeTrialBalance simply invents
 * a zero-balance bucket for an unknown code — so the money went quietly missing from
 * every report driven by the COA. This test makes that class of mistake impossible.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("chart of accounts integrity", () => {
  const srcRoot = join(process.cwd(), "src");

  it("posts only to codes defined in the COA", () => {
    const offenders: string[] = [];

    for (const file of walk(srcRoot)) {
      if (file.includes("__tests__") || file.endsWith(join("lib", "coa.ts"))) continue;
      const text = readFileSync(file, "utf8");
      const re = /code:\s*"(\d{4})"/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const code = match[1];
        if (!COA_BY_CODE[code]) {
          offenders.push(`${file.replace(srcRoot, "src")}: ${code}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("maps every warehouse code to a real inventory account", () => {
    for (const wh of ["MNL", "CEB", "DVO", "URD"]) {
      const code = inventoryAccountFor(wh);
      expect(COA_BY_CODE[code], `${wh} -> ${code}`).toBeDefined();
      expect(COA_BY_CODE[code].type).toBe("ASSET");
    }
  });

  it("rejects a warehouse with no configured inventory account", () => {
    expect(() => inventoryAccountFor("XXX")).toThrow(/No inventory GL account/);
  });

  it("points COGS at an expense account", () => {
    expect(COA_BY_CODE[COGS_ACCOUNT].type).toBe("EXPENSE");
  });

  it("has the accounts the returns and write-off paths depend on", () => {
    // 4900 Sales Returns, 2100 Output VAT, 1100 AR, 5800 Shrinkage.
    for (const code of ["4900", "2100", "1100", "5800"]) {
      expect(COA_BY_CODE[code], code).toBeDefined();
    }
  });
});
