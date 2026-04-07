import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/state.json";

setup("authenticate via Keycloak", async ({ page }) => {
  // Navigate to app — unauthenticated users get redirected to Keycloak login
  await page.goto("/");

  // Wait for Keycloak login form to appear
  await page.getByRole("textbox", { name: "Email" }).waitFor({ timeout: 15_000 });

  // Fill in credentials
  await page.getByRole("textbox", { name: "Email" }).fill(process.env.E2E_USERNAME!);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Wait for redirect back to the app after successful auth
  // Landing page is "/" with title "Storage Connections"
  await page.waitForURL(/localhost:5173/, { timeout: 15_000 });
  await expect(page).toHaveTitle(/Storage Connections/);

  // Save signed-in state for other tests to reuse
  await page.context().storageState({ path: authFile });
});
