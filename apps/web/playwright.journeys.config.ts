import { defineConfig, devices } from '@playwright/test';

// Browser journeys that need the whole stack (database, mail, fake identity
// provider). `scripts/e2e_journeys.mjs` starts that stack and a temporary
// production build, then runs this config; running it by hand needs the same
// environment variables (see the script). Serial on purpose: the journeys share
// one workspace and build on each other's state.
export default defineConfig({
  testDir: './e2e/journeys',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: './test-results-journeys',
  reporter: [['list'], ['json', { outputFile: 'test-results-journeys/results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
