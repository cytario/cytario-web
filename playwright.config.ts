import { defineConfig, devices } from "@playwright/test";

import { DEFAULT_APP_URL } from "./e2e/config";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.AUTH_BASE_URL || DEFAULT_APP_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          //this must be enabled to avoid too many redirects on login
          args: [
            "--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure",
          ],
        },
      },
    },
  ],
});
