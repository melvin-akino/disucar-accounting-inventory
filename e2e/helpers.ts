import { Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/dashboard|orders|inventory/);
}

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@disucarsales.ph",
  password: process.env.E2E_ADMIN_PASS ?? "admin123",
};

export const FINANCE = {
  email: process.env.E2E_FINANCE_EMAIL ?? "finance@disucarsales.ph",
  password: process.env.E2E_FINANCE_PASS ?? "finance123",
};

export const WAREHOUSE = {
  email: process.env.E2E_WAREHOUSE_EMAIL ?? "warehouse@disucarsales.ph",
  password: process.env.E2E_WAREHOUSE_PASS ?? "warehouse123",
};
