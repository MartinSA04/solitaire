import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;

// The suite drives the STATIC BUILD via `astro preview`, not `astro dev`.
// Dealing, dragging and the win animation all behave differently under HMR
// (injected client scripts, unminified timing), and the built output is what
// ships — so it is what gets tested. The build is part of the webServer command
// so a local `pnpm test:e2e` can never test a stale dist/.
export default defineConfig({
  testDir: "./e2e",
  // `*.pw.ts`, not the default `*.test.ts`: `pnpm test` globs `test/**/*.test.ts`
  // through `node --test`, and a shared suffix means one runner eventually tries
  // to execute the other's files. The suffixes keep the two suites structurally
  // unable to collide.
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
