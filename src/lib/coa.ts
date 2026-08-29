export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type NormalBalance = "DR" | "CR";

export interface CoaAccount {
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
}

export const COA: CoaAccount[] = [
  // Assets
  { code: "1000", name: "Cash on Hand",                           type: "ASSET",     normal: "DR" },
  { code: "1010", name: "Cash in Bank — BPI Operating",           type: "ASSET",     normal: "DR" },
  { code: "1020", name: "Cash in Bank — Metrobank Payroll",       type: "ASSET",     normal: "DR" },
  { code: "1030", name: "Cash in Transit — Field Collections",    type: "ASSET",     normal: "DR" },
  { code: "1100", name: "Accounts Receivable — Trade",            type: "ASSET",     normal: "DR" },
  { code: "1110", name: "Allowance for Doubtful Accounts",        type: "ASSET",     normal: "CR" },
  { code: "1150", name: "Withholding Tax Receivable (CWT 2307)",  type: "ASSET",     normal: "DR" },
  { code: "1200", name: "Inventory — MNL",                        type: "ASSET",     normal: "DR" },
  { code: "1210", name: "Inventory — CEB",                        type: "ASSET",     normal: "DR" },
  { code: "1220", name: "Inventory — DVO",                        type: "ASSET",     normal: "DR" },
  { code: "1230", name: "Inventory — URD",                        type: "ASSET",     normal: "DR" },
  { code: "1300", name: "Prepaid Expenses",                       type: "ASSET",     normal: "DR" },
  { code: "1500", name: "Property, Plant & Equipment",            type: "ASSET",     normal: "DR" },
  { code: "1510", name: "Accumulated Depreciation",               type: "ASSET",     normal: "CR" },
  // Liabilities
  { code: "2000", name: "Accounts Payable — Trade",               type: "LIABILITY", normal: "CR" },
  { code: "2100", name: "Output VAT Payable",                     type: "LIABILITY", normal: "CR" },
  { code: "2110", name: "Input VAT",                              type: "LIABILITY", normal: "DR" },
  { code: "2150", name: "Withholding Tax Payable (1601-EQ)",      type: "LIABILITY", normal: "CR" },
  { code: "2160", name: "Withholding Tax Payable (1601-C)",       type: "LIABILITY", normal: "CR" },
  { code: "2200", name: "SSS Payable",                            type: "LIABILITY", normal: "CR" },
  { code: "2210", name: "PhilHealth Payable",                     type: "LIABILITY", normal: "CR" },
  { code: "2220", name: "Pag-IBIG Payable",                       type: "LIABILITY", normal: "CR" },
  { code: "2300", name: "Customer Deposits",                      type: "LIABILITY", normal: "CR" },
  // Equity
  { code: "3000", name: "Owner's Capital",                        type: "EQUITY",    normal: "CR" },
  { code: "3100", name: "Retained Earnings",                      type: "EQUITY",    normal: "CR" },
  // Revenue
  { code: "4000", name: "Sales Revenue",                          type: "REVENUE",   normal: "CR" },
  { code: "4900", name: "Sales Returns & Allowances",             type: "REVENUE",   normal: "DR" },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold",                     type: "EXPENSE",   normal: "DR" },
  { code: "5100", name: "Salaries & Wages",                       type: "EXPENSE",   normal: "DR" },
  { code: "5200", name: "Rent Expense",                           type: "EXPENSE",   normal: "DR" },
  { code: "5300", name: "Utilities",                              type: "EXPENSE",   normal: "DR" },
  { code: "5400", name: "Freight & Logistics",                    type: "EXPENSE",   normal: "DR" },
  { code: "5500", name: "Depreciation Expense",                   type: "EXPENSE",   normal: "DR" },
  { code: "5600", name: "Bad Debt Expense",                       type: "EXPENSE",   normal: "DR" },
  { code: "5700", name: "Bank Charges",                           type: "EXPENSE",   normal: "DR" },
  { code: "5800", name: "Inventory Shrinkage / B.O. Write-off",   type: "EXPENSE",   normal: "DR" },
];

export const COA_BY_CODE = Object.fromEntries(COA.map((a) => [a.code, a]));

// Opening balances (PHP amounts, sign = normal balance direction)
export const OPENING_BALANCES: Record<string, number> = {
  "1000":   850_000,  "1010": 8_420_000,  "1020": 1_240_000,
  "1100": 4_280_000,  "1110":  -180_000,  "1150":   320_000,
  "1200": 6_800_000,  "1210": 2_150_000,  "1220": 1_280_000,
  "1300":   720_000,  "1500":14_200_000,  "1510":-3_680_000,
  "2000":-2_400_000,  "2100":  -540_000,  "2110":   320_000,
  "2150":  -180_000,  "2160":  -240_000,  "2200":   -98_000,
  "2210":   -42_000,  "2220":   -32_000,  "2300":  -180_000,
  "3000":-16_000_000, "3100": -8_800_000,
  "4000":-28_400_000,
  "4900":   220_000,
  "5000":11_800_000,  "5100":  8_400_000, "5200": 1_080_000,
  "5300":   920_000,  "5400":    480_000, "5500":   624_000,
  "5600":    80_000,  "5700":     38_000,
};

// Inventory GL account per warehouse code. Shared by receiving (B.O. write-offs) and
// by order fulfilment (FIFO COGS), which must credit the same account that receiving
// debited or inventory will never net to zero.
export const INVENTORY_ACCOUNT_BY_WAREHOUSE_CODE: Record<string, string> = {
  MNL: "1200",
  CEB: "1210",
  DVO: "1220",
  URD: "1230",
};

export function inventoryAccountFor(warehouseCode: string): string {
  const account = INVENTORY_ACCOUNT_BY_WAREHOUSE_CODE[warehouseCode];
  if (!account) {
    throw new Error(`No inventory GL account configured for warehouse ${warehouseCode}`);
  }
  return account;
}

export const COGS_ACCOUNT = "5000";

export type TrialBalance = Record<string, number>;

export function computeTrialBalance(
  journalLines: { code: string; dr: number; cr: number }[]
): TrialBalance {
  const bal: TrialBalance = {};
  COA.forEach((a) => { bal[a.code] = OPENING_BALANCES[a.code] ?? 0; });
  for (const l of journalLines) {
    if (bal[l.code] === undefined) bal[l.code] = 0;
    bal[l.code] = bal[l.code] + l.dr - l.cr;
  }
  return bal;
}
