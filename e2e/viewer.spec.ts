import { test, expect } from "@playwright/test";

const TEST_IMAGE_PATH =
  process.env.E2E_IMAGE_PATH ||
  "/connections/Exchange/Ascent%20Pharma%20Group/USL-2024-58461-3.ome.tif";

test.describe("SRS-CY-33101: Image viewer renders for OME-TIFF files", () => {
  test("viewer mounts without error for a known image", async ({ page }) => {
    await page.goto(TEST_IMAGE_PATH);

    // The viewer renders deck.gl canvas elements and magnification controls
    await expect(page.locator("#deckgl-overlay").first()).toBeAttached({
      timeout: 30_000,
    });

    // Magnification presets confirm the viewer UI loaded
    await expect(
      page.getByRole("radiogroup", { name: "Magnification presets" }),
    ).toBeVisible({ timeout: 10_000 });

    // No error boundary should be visible
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
