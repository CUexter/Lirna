import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/browser/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
});
