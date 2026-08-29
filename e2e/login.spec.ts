import { test, expect } from "@playwright/test";
import { login, ADMIN } from "./helpers";

test.describe("Authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("admin can log in and see the dashboard", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("logout clears session and redirects to login", async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // Click logout (button or link with text 'Sign out' or 'Logout')
    await page.getByRole("button", { name: /sign out|logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
