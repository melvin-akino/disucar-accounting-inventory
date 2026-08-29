import { test, expect } from "@playwright/test";
import { login, WAREHOUSE } from "./helpers";

test.describe("Inventory page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, WAREHOUSE.email, WAREHOUSE.password);
  });

  test("shows stock table with on-hand and reserved columns", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page.getByRole("columnheader", { name: /on.?hand/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /reserved/i })).toBeVisible();
  });

  test("lots tab shows lot/batch data", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("tab", { name: /lots|batches/i }).click();
    // Header should reflect the lots tab
    await expect(page.getByRole("columnheader", { name: /lot/i })).toBeVisible();
  });

  test("can navigate to low-stock tab", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("tab", { name: /low.?stock|reorder/i }).click();
    // Should show something (empty state or rows)
    const tableOrEmpty = page.locator("table, .empty-state");
    await expect(tableOrEmpty.first()).toBeVisible();
  });
});
