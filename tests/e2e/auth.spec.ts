import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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

test("synthetic user signs in with pre-configured account", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Synthetic Sign In/i)).toBeVisible();

  // Policy banner check
  await expect(page.getByText(/Policy Guard: Human-Only Patching/i)).toBeVisible();

  // Click Sign In
  await page.getByRole("button", { name: /Sign In as synthetic-01/i }).click();

  // Verify successful redirection
  await expect(page).toHaveURL("/");

  // Explicit PostHog flush
  await page.evaluate(async () => {
    if (typeof (window as any).posthog?.flush === "function") {
      await (window as any).posthog.flush();
    }
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);
});
