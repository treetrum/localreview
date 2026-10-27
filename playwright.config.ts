import { defineConfig } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: ci,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    browserName: "chromium",
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
    launchOptions: {
      // Lets environments with a preinstalled Chromium point at it instead of downloading one.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
});
