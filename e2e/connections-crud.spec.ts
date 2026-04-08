import { test, expect, Browser, Page } from "@playwright/test";

const ROLE_ARN =
  "arn:aws:iam::727043715722:role/keycloack-aws-test-iam-role";
const CONNECTION_NAME = `E2E-Test-${Date.now()}`;
// Use a unique bucket path to avoid unique constraint collision when changing scope
const S3_URI = `slashm-ultivue-exchange/e2e-${Date.now()}`;

async function asAdmin(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: "e2e/.auth/admin-state.json",
  });
  return ctx.newPage();
}

async function asUser(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: "e2e/.auth/state.json",
  });
  return ctx.newPage();
}

test.describe.serial(
  "SRS-CY-44103, SRS-CY-44104, SRS-CY-44105, SRS-CY-44107: Connection CRUD lifecycle",
  () => {
    test("admin creates a personal-scoped connection", async ({ browser }) => {
      const page = await asAdmin(browser);
      await page.goto("/connections");

      // Open create modal
      await page.getByRole("button", { name: "Connect Storage" }).click();
      await expect(
        page.getByRole("dialog", { name: "Connect Storage" }),
      ).toBeVisible();

      // Step 1: provider (AWS default), S3 URI, name
      await page
        .getByRole("textbox", { name: "my-bucket/path/prefix" })
        .fill(S3_URI);
      await page.getByRole("textbox", { name: "my-connection" }).clear();
      await page
        .getByRole("textbox", { name: "my-connection" })
        .fill(CONNECTION_NAME);
      await page.getByRole("button", { name: "Next" }).click();

      // Step 2: visibility stays Personal (default), fill Role ARN, region defaults to eu-central-1
      await page
        .getByRole("textbox", {
          name: "arn:aws:iam::123456789012:role/MyRole",
        })
        .fill(ROLE_ARN);
      await page.getByRole("button", { name: "Next" }).click();

      // Step 3: summary — verify and submit
      const dialog = page.getByRole("dialog", { name: "Connect Storage" });
      await expect(dialog.getByText("Summary")).toBeVisible();
      await expect(dialog.getByText(CONNECTION_NAME)).toBeVisible();
      await dialog.getByRole("button", { name: "Connect Storage" }).click();

      // Should redirect to the new connection page
      await page.waitForURL(
        new RegExp(`/connections/${encodeURIComponent(CONNECTION_NAME)}`),
        { timeout: 10_000 },
      );

      await page.context().close();
    });

    test("regular user cannot see the personal connection", async ({
      browser,
    }) => {
      const page = await asUser(browser);
      await page.goto("/connections");
      await expect(page.getByText(CONNECTION_NAME)).not.toBeVisible({
        timeout: 5_000,
      });
      await page.context().close();
    });

    test("admin edits connection visibility to cytario scope", async ({
      browser,
    }) => {
      const page = await asAdmin(browser);
      await page.goto("/connections");

      // Wait for the connection card to appear, then open actions menu → Edit
      const actionsBtn = page.getByRole("button", {
        name: `Actions for ${CONNECTION_NAME}`,
        exact: true,
      });
      await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
      await actionsBtn.click();
      await page.getByRole("menuitem", { name: "Edit" }).click();

      // Edit modal should open
      const editDialog = page.getByRole("dialog", { name: "Edit Connection" });
      await expect(editDialog).toBeVisible();

      // Navigate to step 2 (Connection Details)
      await editDialog.getByRole("button", { name: "Next" }).click();

      // Change Visibility from Personal to Cytario
      await editDialog
        .getByRole("button", { name: "Personal" })
        .click();
      await page.getByRole("option", { name: "Cytario" }).click();

      // Wait for the select to reflect the new value
      await expect(
        editDialog.getByRole("button", { name: "Cytario" }),
      ).toBeVisible();

      // Navigate to step 3 and submit
      await editDialog.getByRole("button", { name: "Next" }).click();
      await expect(editDialog.getByText("Summary")).toBeVisible();
      await editDialog
        .getByRole("button", { name: "Save Changes" })
        .click();

      // Should redirect after save
      await page.waitForURL(/\/connections/, { timeout: 10_000 });

      // Verify the dialog is closed (edit completed)
      await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

      await page.context().close();
    });

    test("regular user can see the connection but cannot edit or delete", async ({
      browser,
    }) => {
      const page = await asUser(browser);
      await page.goto("/connections");

      // Connection should now be visible with cytario scope
      await expect(page.getByText(CONNECTION_NAME)).toBeVisible({
        timeout: 10_000,
      });

      // Open the actions menu and verify only "Open" is available
      const actionsBtn = page.getByRole("button", {
        name: `Actions for ${CONNECTION_NAME}`,
        exact: true,
      });

      if (await actionsBtn.isVisible()) {
        await actionsBtn.click();
        const menu = page.getByRole("menu", {
          name: `Actions for ${CONNECTION_NAME}`,
        });
        await expect(menu.getByRole("menuitem", { name: "Open" })).toBeVisible();
        await expect(
          menu.getByRole("menuitem", { name: "Edit" }),
        ).not.toBeVisible();
        await expect(
          menu.getByRole("menuitem", { name: "Delete" }),
        ).not.toBeVisible();
        await page.keyboard.press("Escape");
      }

      await page.context().close();
    });

    test("admin deletes the connection", async ({ browser }) => {
      const page = await asAdmin(browser);
      await page.goto("/connections");

      // Open actions menu → Delete
      const actionsBtn = page.getByRole("button", {
        name: `Actions for ${CONNECTION_NAME}`,
        exact: true,
      });
      await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
      await actionsBtn.click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      // Confirm deletion
      await expect(page.getByText("Remove connection?")).toBeVisible();
      await page.getByRole("button", { name: "Remove" }).click();

      // Wait for the confirm dialog to close and connection to disappear
      await expect(
        page.getByRole("dialog", { name: "Remove connection?" }),
      ).not.toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("button", {
          name: `Actions for ${CONNECTION_NAME}`,
          exact: true,
        }),
      ).not.toBeVisible({ timeout: 10_000 });

      await page.context().close();
    });

    test("regular user confirms connection is gone", async ({ browser }) => {
      const page = await asUser(browser);
      await page.goto("/connections");
      await expect(page.getByText(CONNECTION_NAME)).not.toBeVisible({
        timeout: 5_000,
      });
      await page.context().close();
    });
  },
);
