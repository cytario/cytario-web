import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker: logout test destroys the server-side session (Valkey),
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
      name: "viewer-setup",
      testMatch: /auth\.viewer-setup\.ts/,
    },
    {
      name: "admin-setup",
      testMatch: /auth\.admin-setup\.ts/,
    },
    {
      name: "connections-crud",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /connections-crud/,
      dependencies: ["viewer-setup", "admin-setup"],
    },
    {
      name: "browsing",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/viewer.json",
      },
      testMatch: /browse\.spec|viewer\.spec/,
      dependencies: ["viewer-setup", "connections-crud"],
    },
    {
      // Runs last — logout destroys the server-side session
      name: "auth-tests",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/viewer.json",
      },
      testMatch: /auth\.spec\.ts/,
      dependencies: ["browsing"],
    },
  ],
});
