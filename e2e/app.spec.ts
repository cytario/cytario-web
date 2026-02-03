import { test, expect, type Page, type TestInfo } from "@playwright/test";

const BUCKET_NAME = process.env.E2E_BUCKET_NAME;
const ROLE_ARN = process.env.E2E_ROLE_ARN;
const MARKER_NAME = "DAPI";

if (!BUCKET_NAME || !ROLE_ARN) {
  throw new Error(
    "E2E_BUCKET_NAME and E2E_ROLE_ARN environment variables must be set",
  );
}

async function notifySlack(testInfo: TestInfo) {
  const token = process.env.E2E_SLACK_BOT_TOKEN;
  const channel = process.env.E2E_SLACK_CHANNEL_ID;

  if (!token || !channel) {
    throw new Error(
      "E2E_SLACK_BOT_TOKEN and E2E_SLACK_CHANNEL_ID environment variables must be set",
    );
  }

  if (testInfo.status === "passed") return;

  const text = [
    `*E2E Test Failed*`,
    `Test: ${testInfo.titlePath.join(" > ")}`,
    `Status: ${testInfo.status}`,
    `Duration: ${(testInfo.duration / 1000).toFixed(1)}s`,
    testInfo.error?.message ? `Error: \`${testInfo.error.message}\`` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text }),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }
}

async function login(page: Page) {
  const username = process.env.E2E_USER;
  const password = process.env.E2E_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "E2E_USER and E2E_PASSWORD environment variables must be set",
    );
  }

  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();

  await expect(page.locator('[aria-label="User menu"]')).toBeVisible({
    timeout: 5000,
  });
}

async function logout(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.locator('[aria-label="User menu"]').click();
  await page.locator('a[href="/logout"]').click();

  await expect(page.locator("#kc-login")).toBeVisible({ timeout: 5000 });
}

async function removeBucketIfExists(page: Page): Promise<boolean> {
  const bucketLink = page.locator("a", { hasText: BUCKET_NAME });

  if ((await bucketLink.count()) === 0) {
    return false;
  }

  const infoIcon = page.locator(".lucide-info").first();
  await infoIcon.click();

  const removeButton = page.locator("button", {
    hasText: "Remove Data Connection",
  });
  await expect(removeButton).toBeVisible({ timeout: 5000 });

  await removeButton.click();
  await page.waitForLoadState("networkidle");
  return true;
}

async function connectBucket(page: Page) {
  await page.waitForLoadState("networkidle");
  const connectStorageLink = page.locator("a", { hasText: "Connect Storage" });
  const nextBucketButton = page.locator("button", { hasText: "Next" });
  await expect(connectStorageLink).toBeVisible({ timeout: 10000 });
  await connectStorageLink.click();
  await expect(nextBucketButton).toBeVisible({ timeout: 10000 });
  nextBucketButton.click();

  await page.locator('input[name="s3Uri"]').fill(BUCKET_NAME);
  await page.locator("select").selectOption("eu-central-1");
  nextBucketButton.click();
  await page.locator('input[name="roleArn"]').fill(ROLE_ARN);
  await page.locator("button", { hasText: "Connect Storage" }).click();

  await page.waitForLoadState("networkidle");

  await expect(page.locator("h1", { hasText: BUCKET_NAME })).toBeVisible({
    timeout: 10000,
  });
}

async function verifyViewer(page: Page) {
  const folderLink = page.locator("a", { hasText: "Ascent Pharma Group" });
  await expect(folderLink).toBeVisible({ timeout: 10000 });
  await folderLink.click();
  await page.waitForLoadState("networkidle");

  const fileLink = page.locator("a", { hasText: ".ome.tif" });
  await expect(fileLink).toBeVisible({ timeout: 10000 });
  await fileLink.click();
  await page.waitForLoadState("networkidle");

  const deckglOverlay = page.locator("#deckgl-overlay").last();
  await expect(deckglOverlay).toBeVisible({ timeout: 30000 });

  const enabledMarker = page.getByText(MARKER_NAME, { exact: true });
  const isMarkerVisible = await enabledMarker.isVisible();

  if (!isMarkerVisible) {
    const channelsButton = page.locator("button", { hasText: "Channels" });
    await expect(channelsButton).toBeVisible({ timeout: 10000 });
    await channelsButton.click();
  }

  await expect(enabledMarker).toBeVisible({ timeout: 30000 });
}

test.describe("App E2E", () => {
  test.afterEach(async ({}, testInfo) => {
    await notifySlack(testInfo);
  });

  test("connects bucket and verifies viewer", async ({ page, baseURL }) => {
    await page.goto(baseURL!);

    await login(page);
    await page.waitForLoadState("networkidle");

    const bucketExisted = await removeBucketIfExists(page);
    if (bucketExisted) {
      await logout(page);
      await page.goto(baseURL!);
      await login(page);
      await page.waitForLoadState("networkidle");
    }

    await connectBucket(page);
    await verifyViewer(page);

    await page.goto(baseURL!);
    await page.waitForLoadState("networkidle");
    await removeBucketIfExists(page);
    await logout(page);
  });
});
