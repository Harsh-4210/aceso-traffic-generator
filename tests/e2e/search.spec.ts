import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Inject synthetic flag before scripts load (Blueprint line 883)
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
  });
});

test("synthetic user searches for products and filters category", async ({ page }) => {
  await page.goto("/search");
  await expect(page).toHaveTitle(/Aceso Target Shop/);

  // Verify catalogue loads products
  const productCards = page.locator("a[href^='/product/']");
  await expect(productCards.first()).toBeVisible();

  // Search for "headphones"
  const searchInput = page.locator("input[placeholder*='Filter by keyword']");
  await searchInput.fill("headphones");
  await searchInput.press("Enter");

  // Verify filtered results
  await expect(page.locator("h1")).toContainText(/headphones/i);
  await expect(page.getByText("Wireless Noise-Canceling Headphones")).toBeVisible();
});
