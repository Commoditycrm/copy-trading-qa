/**
 * Playwright configuration — drives BOTH UI E2E and API black-box suites (API via
 * APIRequestContext). Suite selection is by project + tag (`@smoke`, `@api`, `@ui`,
 * `@prod-safe`, `@destructive`, `@P1`…). See docs/TEST_PLAN.md §4 for the CI model.
 *
 * NOTE: test directories are intentionally near-empty at skeleton stage — broad
 * coverage is authored in later phases.
 */
import { defineConfig, devices } from '@playwright/test';
import { loadConfig } from './common/config.js';

const cfg = loadConfig();
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  globalSetup: './common/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 4 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['allure-playwright', { resultsDir: 'reports/allure-results' }],
  ],
  outputDir: 'reports/artifacts',
  use: {
    baseURL: cfg.apiBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [
    // API black-box (no browser needed) — the primary API surface.
    { name: 'api', testDir: './api/tests', use: {} },
    // UI E2E — Chromium first; add firefox/webkit when journeys stabilize.
    // Evidence (trace/screenshot/video) is captured ONLY on failure; drop the API Accept header for
    // real browser navigation. All UI data is synthetic (@qa.kopyya.dev) so artifacts carry no real PII.
    {
      name: 'ui',
      testDir: './ui/tests',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: cfg.frontendUrl,
        extraHTTPHeaders: {},
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
    // Accessibility (axe-core) — Chromium desktop; tests switch to a mobile viewport / 200% zoom / 320px
    // reflow in-test. Kept as its own project so the UI regression count stays stable.
    {
      name: 'a11y',
      testDir: './a11y/tests',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: cfg.frontendUrl,
        extraHTTPHeaders: {},
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
    },
    // Performance — measurement runs (fanout scaling + UI timings/web-vitals). Isolated so the API/UI
    // regression counts stay stable. Longer timeouts for load; browser available for UI-timing tests.
    {
      name: 'perf',
      testDir: './perf/tests',
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: cfg.frontendUrl,
        extraHTTPHeaders: {},
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    // Smoke (fake/none broker) — shallow critical paths.
    { name: 'smoke', testDir: './smoke/tests', grep: /@smoke/ },
    // Production read-only smoke — ONLY @prod-safe tests may live here.
    {
      name: 'prod-smoke',
      testDir: './smoke/tests',
      grep: /@prod-safe/,
      grepInvert: /@destructive/,
      use: { baseURL: cfg.apiBaseUrl },
    },
  ],
});
