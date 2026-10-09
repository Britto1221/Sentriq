import { defineConfig, devices } from "@playwright/test";

// E2E personas share one loopback IP, unlike real visitors. Keep the global
// IP budget high so a long browser suite does not exhaust it across accounts;
// route and recovery abuse limits are exercised by the dedicated API tests.
const apiTestEnvironment: Record<string, string> = {
  ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
  SENTRIQ_RATE_LIMIT_MAX: "1000",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The E2E flows share one local API/database and CDP virtual authenticators.
  // Serial execution keeps their security state isolated and timing predictable.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: ".artifacts/playwright",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "northstar-chromium",
      testMatch: /northstar.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3001" },
    },
    {
      name: "responsive-northstar",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3001" },
    },
  ],
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://127.0.0.1:4000/health",
      env: apiTestEnvironment,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev:northstar",
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
