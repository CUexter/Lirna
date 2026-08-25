import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.E2E_WEB_PORT ?? 3001);
const baseURL = `http://127.0.0.1:${webPort}`;
const apiPort = Number(process.env.E2E_API_PORT ?? 3102);
const apiURL = `http://127.0.0.1:${apiPort}`;
const webCommand = process.env.E2E_PRODUCTION
  ? `bun run --cwd apps/web serve --host 127.0.0.1 --port ${webPort} --strictPort`
  : `bun run --cwd apps/web start --host 127.0.0.1 --port ${webPort} --strictPort`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { outputFolder: "playwright-report" }], ["line"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun run e2e:api",
      url: `${apiURL}/healthz`,
      reuseExistingServer: false,
    },
    {
      command: webCommand,
      url: baseURL,
      reuseExistingServer: false,
      env: {
        VITE_SERVER_URL: apiURL,
      },
    },
  ],
  projects: [
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "firefox-mobile",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 393, height: 851 },
      },
    },
  ],
});
