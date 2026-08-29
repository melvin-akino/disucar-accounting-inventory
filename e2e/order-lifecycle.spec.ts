/**
 * E2E: Full order lifecycle — create → approve → prepare → ship → deliver.
 * Requires seeded demo data (customer "Metro General", warehouse "Main WH", SKU "Amoxicillin").
 * Run against the live Docker container (BASE_URL=http://localhost:3000).
 */
import { test, expect, Page } from "@playwright/test";
import { login, FINANCE, WAREHOUSE } from "./helpers";

// Shared state: the order ID created during the test run
let orderId: string;

async function getOrderId(page: Page): Promise<string> {
  // After creation, we land on the orders list; pick the first SO- link
  const link = page.getByRole("link", { name: /SO-\d{4}-\d{4}/ }).first();
  await expect(link).toBeVisible({ timeout: 8000 });
  const href = await link.getAttribute("href");
  return href?.split("/").pop() ?? "";
}

test.describe.serial("Order lifecycle", () => {
  test("FINANCE can create a new sales order", async ({ page }) => {
    await login(page, FINANCE.email, FINANCE.password);
    await page.goto("/orders");

    // Open "New Order" modal
    await page.getByRole("button", { name: /new order/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Select customer (first option in dropdown)
    await page.getByLabel(/customer/i).selectOption({ index: 1 });

    // Select warehouse
    await page.getByLabel(/warehouse/i).selectOption({ index: 1 });

    // Add a line item
    await page.getByRole("button", { name: /add item|add line/i }).click();
    const skuSelects = page.getByLabel(/sku|item/i);
    await skuSelects.first().selectOption({ index: 1 });
    await page.getByLabel(/qty|quantity/i).first().fill("5");
    await page.getByLabel(/unit price/i).first().fill("200");

    // Submit
    await page.getByRole("button", { name: /create order/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10000 });

    orderId = await getOrderId(page);
    expect(orderId).toMatch(/SO-\d{4}-\d{4}/);
  });

  test("FINANCE can approve the order", async ({ page }) => {
    test.skip(!orderId, "Depends on order creation test");
    await login(page, FINANCE.email, FINANCE.password);
    await page.goto(`/orders/${orderId}`);

    await page.getByRole("button", { name: /approve/i }).click();
    await expect(page.getByText(/approved/i)).toBeVisible({ timeout: 8000 });
  });

  test("WAREHOUSE can mark order as preparing", async ({ page }) => {
    test.skip(!orderId, "Depends on approve test");
    await login(page, WAREHOUSE.email, WAREHOUSE.password);
    await page.goto(`/orders/${orderId}`);

    await page.getByRole("button", { name: /start preparing|preparing/i }).click();
    await expect(page.getByText(/preparing/i)).toBeVisible({ timeout: 8000 });
  });

  test("WAREHOUSE can mark order as shipped", async ({ page }) => {
    test.skip(!orderId, "Depends on preparing test");
    await login(page, WAREHOUSE.email, WAREHOUSE.password);
    await page.goto(`/orders/${orderId}`);

    await page.getByRole("button", { name: /mark shipped|shipped/i }).click();
    await expect(page.getByText(/shipped/i)).toBeVisible({ timeout: 8000 });
  });

  test("WAREHOUSE can confirm delivery", async ({ page }) => {
    test.skip(!orderId, "Depends on shipped test");
    await login(page, WAREHOUSE.email, WAREHOUSE.password);
    await page.goto(`/orders/${orderId}`);

    await page.getByRole("button", { name: /confirm delivery|delivered/i }).click();
    await expect(page.getByText(/delivered/i)).toBeVisible({ timeout: 8000 });
  });

  test("delivered order cannot be cancelled", async ({ page }) => {
    test.skip(!orderId, "Depends on delivery test");
    await login(page, FINANCE.email, FINANCE.password);
    await page.goto(`/orders/${orderId}`);

    // Cancel button should be gone or disabled for DELIVERED orders
    const cancelBtn = page.getByRole("button", { name: /cancel/i });
    const isVisible = await cancelBtn.isVisible();
    if (isVisible) {
      await cancelBtn.click();
      // Expect an error or no state change
      await expect(page.getByText(/cannot cancel/i)).toBeVisible({ timeout: 5000 });
    }
  });
});
