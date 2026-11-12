// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// End-to-end tests (docs/07_TESTS.md §8–§9) on a production build served by `vite preview`.
// RESULTS_DIR chooses the folder the site shows: ../examples (default) or ../results. The tests read their ids
// from the same folder, so the same suite runs on the examples and on a real build.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Optional: a local Chromium instead of Playwright's own download (PW_CHROMIUM=<path to chrome>).
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      testIgnore: /offline\.spec\.ts|screens\.spec\.ts/,
    },
    {
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      testIgnore: /offline\.spec\.ts|screens\.spec\.ts|a11y\.spec\.ts|keyboard\.spec\.ts/,
    },
    {
      name: 'offline',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
      testMatch: /offline\.spec\.ts/,
    },
    {
      name: 'screens',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /screens\.spec\.ts/,
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
