import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const qualitySuite = "**/frontend-quality.test.ts";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  outputDir: "test-results/artifacts",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "connector-regression",
      testIgnore: [qualitySuite],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop-chromium",
      testMatch: [qualitySuite],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet-chromium",
      testMatch: [qualitySuite],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: "small-mobile-chromium",
      testMatch: [qualitySuite],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "mobile-landscape-chromium",
      testMatch: [qualitySuite],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 667, height: 375 },
      },
    },
    {
      name: "mobile-webkit",
      testMatch: [qualitySuite],
      use: { ...devices["iPhone 13"] },
    },
  ],
  // CI exercises the already-built Next.js application, not an additional dev server.
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
