import { test, expect } from "@playwright/test";

test.describe("SRS-CY-31101, SRS-CY-31105: Auth round-trip", () => {
  test("authenticated user can access the app and sees home page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Storage Connections/);
    await expect(
      page.getByRole("heading", { name: /storage connections/i }),
    ).toBeVisible();
  });

  test("logout redirects to login page", async ({ page }) => {
    await page.goto("/");

    // Trigger logout
    await page.goto("/logout");

    // Should end up on the login page (either app's /login or Keycloak login)
    await page.waitForURL(/\/(login|auth|realms)/, { timeout: 15_000 });
  });

  test("unauthenticated access redirects to Keycloak", async ({ browser }) => {
    // Use a fresh context with no cookies — server-side session won't exist
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    // The SSR middleware redirects unauthenticated users to /login,
    // which then redirects to Keycloak's authorization endpoint
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForURL(/realms\/cytario|\/login/, { timeout: 15_000 });

    // Should end up on Keycloak login form
    await expect(
      page.getByRole("textbox", { name: "Email" }),
    ).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
