import { test, expect } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
    window.__ACESO_EVENTS__ = [];
  });
});

test("synthetic user completes full checkout journey @checkout", async ({ page }) => {
  // Capture unhandled page errors (e.g. React hydration / useEffect crashes)
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  // 1. Visit product detail page
  await page.goto("/product/prod-01");
  await expect(page.getByRole("heading", { name: "Aceso Wireless Noise-Canceling Headphones" })).toBeVisible();
  // Behavioral verification: assert category tag is rendered on the page
  await expect(page.locator("span", { hasText: "electronics" }).first()).toBeVisible();

  // Telemetry verification: assert product_viewed event was dispatched with category: "electronics" without crashing
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const events = window.__ACESO_EVENTS__ || [];
          return events.some(
            (e: { event?: string; category?: string; productId?: string }) =>
              e.event === "product_viewed" &&
              e.category === "electronics" &&
              e.productId === "prod-01"
          );
        });
      },
      {
        message: "product_viewed telemetry event not dispatched with valid category",
        timeout: 5000,
      }
    )
    .toBe(true);

  expect(pageErrors).toHaveLength(0);

  // 2. Add product to cart
  await page.getByRole("button", { name: /Add to Cart/i }).click();
  await expect(page.getByText(/Added \d+ ×/)).toBeVisible();

  // 3. Go to cart
  await page.goto("/cart");
  await expect(page.getByText(/Shopping Cart/i)).toBeVisible();
  await expect(page.getByText("Wireless Noise-Canceling Headphones")).toBeVisible();
  // Monetary verification: verify ground-truth total ($215.99 = $199.99 subtotal + $0 shipping + $16.00 tax)
  await expect(page.getByText("$215.99")).toBeVisible();

  // Exercise cart quantity adjustment (increment to 2, then decrement back to 1)
  await page.getByRole("button", { name: "+", exact: true }).click();
  await expect(page.getByText("$399.98").first()).toBeVisible();
  await page.getByRole("button", { name: "-", exact: true }).click();
  await expect(page.getByText("$199.99").first()).toBeVisible();
  await expect(page.getByText("$215.99")).toBeVisible();
  expect(pageErrors).toHaveLength(0);

  // 4. Proceed to checkout
  await page.getByRole("button", { name: /Proceed to Checkout/i }).click();
  await expect(page).toHaveURL(/.*checkout/);
  // Monetary verification: verify 8% tax ($16.00) and order total button ($215.99)
  await expect(page.getByText("$16.00")).toBeVisible();
  await expect(page.getByRole("button", { name: /Place Order \(\$215\.99\)/i })).toBeVisible();

  // Telemetry verification: assert checkout_started event was dispatched
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const events = window.__ACESO_EVENTS__ || [];
          return events.some(
            (e: { event?: string; total?: number }) =>
              e.event === "checkout_started" && Math.abs((e.total || 0) - 215.99) < 0.01
          );
        });
      },
      {
        message: "checkout_started telemetry event not dispatched with correct total",
        timeout: 5000,
      }
    )
    .toBe(true);

  expect(pageErrors).toHaveLength(0);

  // 5. Place order
  await page.getByRole("button", { name: /Place Order/i }).click();

  // 6. Verify confirmation page (HC-1.1 proof)
  await expect(page).toHaveURL(/.*order-success/);
  await expect(page.getByRole("heading", { name: /Order Confirmed!/i })).toBeVisible();
  await expect(page.getByText("$215.99")).toBeVisible();
  await expect(page.getByText(/checkout_completed/i)).toBeVisible();

  // Final sanity check: no uncaught page errors across the entire journey
  expect(pageErrors).toHaveLength(0);
});

test("cart under $50 keeps free shipping @checkout", async ({ page }) => {
  // The main journey uses a $199.99 cart, so any shipping rule that is free
  // above $50 passes it. This cart is below every threshold a regression could
  // pick: $28.00 subtotal + $0 shipping + $2.24 tax (8%) = $30.24.
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/product/prod-10");
  await page.getByRole("button", { name: /Add to Cart/i }).click();
  await expect(page.getByText(/Added \d+ ×/)).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("Merino Wool Everyday Crew Socks (3-Pack)")).toBeVisible();
  await expect(page.getByText("$2.24")).toBeVisible();
  await expect(page.getByText("$30.24")).toBeVisible();
  expect(pageErrors).toHaveLength(0);
});
