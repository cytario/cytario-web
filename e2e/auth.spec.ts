import { test, expect } from "@playwright/test";

import { DEFAULT_APP_URL } from "./config";

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || DEFAULT_APP_URL;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

test.describe("Auth page", () => {
  test("should sign in successfully", async ({ page }) => {
    await page.goto(AUTH_BASE_URL);

    await page.waitForLoadState("networkidle");

    // Fill in credentials
    await page.locator("#username").fill(TEST_EMAIL!);
    await page.locator("#password").fill(TEST_PASSWORD!);
    await page.waitForLoadState("networkidle");

    // Click Sign In
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForLoadState("networkidle");

    // Wait for Connect Bucket button after successful login
    await expect(
      page.getByRole("link", { name: "Connect Bucket" }),
    ).toBeVisible();
  });
});
