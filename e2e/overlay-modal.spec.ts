import { expect, test } from "@playwright/test";

/**
 * End-to-end tests for the Overlay Modal.
 *
 * Requires:
 *   - Dev server running (`npm run dev`)
 *   - Local services (Keycloak, MinIO, PostgreSQL, Valkey) via devenv
 *   - An authenticated user session
 *   - At least one connected bucket with an OME-TIFF file open in the viewer
 *
 * Run with: npx playwright test e2e/overlay-modal.spec.ts
 */

test.describe("Overlay Modal", () => {
  // NOTE: Update this URL to match your local viewer route.
  // Example: /buckets/minio/test-bucket/sample.ome.tiff
  const VIEWER_URL = "/buckets/minio/test-bucket/sample.ome.tiff";

  test.beforeEach(async ({ page }) => {
    // Navigate to the viewer page (assumes authenticated session via cookies/storage)
    await page.goto(VIEWER_URL);

    // Wait for the FeatureBar to load
    await page.waitForSelector('[role="toolbar"]');

    // Expand the Overlays section if collapsed
    const overlaysHeader = page.getByText("Overlays", { exact: true });
    await overlaysHeader.click();

    // Wait for the "Add Overlay" button to appear
    await page.waitForSelector('a:has-text("Add Overlay")');
  });

  test("opens overlay modal when clicking Add Overlay", async ({ page }) => {
    await page.click('a:has-text("Add Overlay")');

    // Wait for the modal to appear
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Verify the modal title
    await expect(
      page.getByText("Select Overlay File", { exact: true }),
    ).toBeVisible();
  });

  test("modal is interactive in Chrome - search input accepts text", async ({
    page,
  }) => {
    await page.click('a:has-text("Add Overlay")');
    await expect(page.getByRole("dialog")).toBeVisible();

    // Find the search input and type
    const searchInput = page.getByPlaceholder("Search .parquet files...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test");
    await expect(searchInput).toHaveValue("test");
  });

  test("modal close button works with isDismissable=false", async ({
    page,
  }) => {
    await page.click('a:has-text("Add Overlay")');

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Click the close (X) button
    await page.click('button[aria-label="Close"]');

    // Modal should close - the dialog should no longer be visible
    await expect(dialog).not.toBeVisible();

    // URL should no longer have the action param
    await expect(page).not.toHaveURL(/action=load-overlay/);
  });

  test("modal Escape key works with isDismissable=false", async ({ page }) => {
    await page.click('a:has-text("Add Overlay")');

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal should close
    await expect(dialog).not.toBeVisible();
  });

  test("modal Cancel button closes the modal", async ({ page }) => {
    await page.click('a:has-text("Add Overlay")');

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Click Cancel
    await page.click('button:has-text("Cancel")');

    // Modal should close
    await expect(dialog).not.toBeVisible();
  });

  test("modal does not close when clicking the backdrop", async ({ page }) => {
    await page.click('a:has-text("Add Overlay")');

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Click the backdrop (outside the modal content but inside the overlay)
    // The overlay covers the full viewport, so clicking at (0, 0) should hit it
    await page.mouse.click(5, 5);

    // Modal should stay open because isDismissable={false}
    await expect(dialog).toBeVisible();
  });
});
