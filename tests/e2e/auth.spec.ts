import { test, expect } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
  });
});

test("synthetic user signs in with pre-configured account @auth", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Synthetic Sign In/i)).toBeVisible();

  // Policy banner check
  await expect(page.getByText(/Policy Guard: Human-Only Patching/i)).toBeVisible();

  // Click Sign In and verify the redirect. The button is in the server HTML,
  // so on a cold preview it can be clicked before React hydrates and the click
  // is lost (the page stays on /login). Retry the click until the redirect
  // happens; a sign-in that never redirects still fails after 30 s.
  await expect(async () => {
    if (new URL(page.url()).pathname === "/login") {
      await page.getByRole("button", { name: /Sign In as synthetic-01/i }).click({ timeout: 5000 });
    }
    await expect(page).toHaveURL("/", { timeout: 5000 });
  }).toPass({ timeout: 30000 });
});
