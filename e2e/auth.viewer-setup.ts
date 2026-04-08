import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/viewer.json";

setup("authenticate viewer via Keycloak", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: "Email" })
    .waitFor({ timeout: 15_000 });

  await page
    .getByRole("textbox", { name: "Email" })
    .fill(process.env.E2E_VIEWER_USERNAME!);
  await page
    .getByRole("textbox", { name: "Password" })
    .fill(process.env.E2E_VIEWER_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveTitle(/Storage Connections/, { timeout: 15_000 });

  await page.context().storageState({ path: authFile });
});
