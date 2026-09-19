import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
  });
});

test("synthetic user signs in with pre-configured account", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Synthetic Sign In/i)).toBeVisible();

  // Policy banner check
  await expect(page.getByText(/Policy Guard: Human-Only Patching/i)).toBeVisible();

  // Click Sign In
  await page.getByRole("button", { name: /Sign In as synthetic-01/i }).click();

  // Verify successful redirection
  await expect(page).toHaveURL("/");
});
