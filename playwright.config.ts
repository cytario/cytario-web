import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker: logout test destroys the server-side session (Redis),
  // which would break parallel tests sharing the same session cookie.
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.WEB_HOST,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "admin-setup",
      testMatch: /auth\.admin-setup\.ts/,
    },
    {
      name: "connections-crud",
      use: {
        ...devices["Desktop Chrome"],
      },
      testMatch: /connections-crud/,
      dependencies: ["setup", "admin-setup"],
    },
    {
      // Run last — the logout test in z-auth.spec.ts destroys the server-side session
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
      testIgnore: /connections-crud/,
      dependencies: ["setup", "connections-crud"],
    },
  ],
});
