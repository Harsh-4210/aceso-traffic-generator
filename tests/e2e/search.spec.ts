import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Inject synthetic flag before scripts load (Blueprint line 883)
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
    window.__ACESO_EVENTS__ = window.__ACESO_EVENTS__ || [];
  });
});

test.afterEach(async ({ page }) => {
  // Explicitly flush PostHog event queue and dispatch pagehide before browser teardown
  await page.evaluate(async () => {
    try {
      window.dispatchEvent(new Event("pagehide"));
      if (typeof (window as any).posthog?.flush === "function") {
        await (window as any).posthog.flush();
      } else if (typeof (window as any).posthog?._handle_unload === "function") {
        (window as any).posthog._handle_unload();
      }
    } catch {}
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
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

  // Explicit PostHog flush
  await page.evaluate(async () => {
    if (typeof (window as any).posthog?.flush === "function") {
      await (window as any).posthog.flush();
    }
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
});
