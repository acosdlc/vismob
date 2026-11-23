import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Runs in the cloud session against `next start` after `npm run build`.
// @playwright/test stays pinned (cdn.playwright.dev is blocked, so no browser can be
// downloaded); the container ships its own Chromium behind the stable path below, whatever
// build it is (1194 in October 2026, 1243 in November), and Playwright launches that one.
// PLAYWRIGHT_CHROMIUM_PATH overrides it; without either, Playwright's own lookup applies.
const CONTAINER_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "npm run start", port: 3000, reuseExistingServer: true, timeout: 60_000 },
});
