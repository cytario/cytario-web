import { test, expect, Page } from "@playwright/test";

const TEST_CONNECTION = process.env.E2E_CONNECTION_NAME || "Exchange";

/** Locator for the connection card button (excludes the nested "Actions for" button) */
const connectionCard = (page: Page) =>
  page.getByRole("button", {
    name: new RegExp(`Status: connected ${TEST_CONNECTION}`),
  });

test.describe("SRS-CY-32101: Browse files in storage connection", () => {
  test("connection list shows the test connection", async ({ page }) => {
    await page.goto("/connections");

    await expect(connectionCard(page)).toBeVisible({ timeout: 10_000 });
  });

  test("navigating into a connection shows the file browser", async ({
    page,
  }) => {
    await page.goto("/connections");

    // Wait for the card to load, then click
    await expect(connectionCard(page)).toBeVisible({ timeout: 10_000 });
    await connectionCard(page).click();

    // Should navigate to /connections/<name>/...
    await page.waitForURL(/\/connections\/.+/, { timeout: 10_000 });

    // File browser should render — directory items appear as buttons in grid view
    await expect(
      page.getByRole("button", { name: "Ascent Pharma Group", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("navigating into a subdirectory updates breadcrumbs", async ({
    page,
  }) => {
    await page.goto("/connections");
    await expect(connectionCard(page)).toBeVisible({ timeout: 10_000 });
    await connectionCard(page).click();
    await page.waitForURL(/\/connections\/.+/, { timeout: 10_000 });

    // Click into a subdirectory
    await page
      .getByRole("button", { name: "Ascent Pharma Group", exact: true })
      .click();

    // Wait for subdirectory page to load
    await page.waitForURL(/Ascent%20Pharma%20Group/, { timeout: 10_000 });

    // Breadcrumbs should show the subdirectory name
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toContainText("Ascent Pharma Group", {
      timeout: 10_000,
    });
    // Parent connection should also be in breadcrumbs as a link
    await expect(
      breadcrumb.getByRole("link", { name: TEST_CONNECTION }),
    ).toBeVisible();
  });
});
