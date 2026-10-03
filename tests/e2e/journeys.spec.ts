import { test, expect } from "./fixtures";

// Behavioural journeys that the original three specs did not exercise:
// header search, the "Continue Shopping" link, cart unit counts, "Buy Now",
// and the category filter pills. Tags select them per journey:
//   @checkout -> cart/product/checkout routes, @search -> /search, @home -> header/home.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__ACESO_SYNTHETIC__ = true;
  });
});

test("cart shows total units and continue shopping returns to catalogue @checkout", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/product/prod-01");
  await page.getByRole("button", { name: /Add to Cart/i }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: "+", exact: true }).click();

  // Two units of one product: both the cart header and the header badge count units.
  await expect(page.getByText("2 items in your order")).toBeVisible();
  await expect(page.getByRole("link", { name: /Cart/ })).toContainText("2");

  await page.getByRole("link", { name: /Continue Shopping/i }).click();
  await expect(page).toHaveURL(/\/search$/);
  expect(pageErrors).toHaveLength(0);
});

test("buy now takes the shopper to checkout @checkout", async ({ page }) => {
  await page.goto("/product/prod-01");
  await page.getByRole("button", { name: /Buy Now/i }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("Aceso Wireless Noise-Canceling Headphones")).toBeVisible();
});

test("category pill filters the catalogue @search", async ({ page }) => {
  await page.goto("/search");
  const main = page.locator("main");
  await expect(main.getByText("Aceso Wireless Noise-Canceling Headphones")).toBeVisible();

  await main.getByRole("button", { name: "Apparel", exact: true }).click();
  await expect(page).toHaveURL(/category=apparel/);
  await expect(main.getByText("Heavyweight Cotton Minimalist Hoodie")).toBeVisible();
  await expect(main.getByText("Aceso Wireless Noise-Canceling Headphones")).not.toBeVisible();
});

test("header search submits from the home page @home", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto("/");
  const headerSearch = page.locator("header input[placeholder^='Search products']");
  await headerSearch.fill("keyboard");
  await headerSearch.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=keyboard/);
  await expect(page.locator("main h1")).toContainText(/keyboard/i);
  expect(pageErrors).toHaveLength(0);
});
