import { defineConfig, devices } from '@playwright/test';

const matrix = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1194 },
  { name: 'desktop', width: 1440, height: 900 },
];

export default defineConfig({
  testDir: './e2e',
  // Full-stack journeys run through playwright.journeys.config.ts.
  testIgnore: '**/journeys/**',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // No baseline is created or updated by an ordinary run.
  updateSnapshots: process.env.CI && process.env.VISUAL_UPDATE === '1' ? 'all' : 'none',
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.002 } },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3001',
    timezoneId: 'Asia/Jakarta',
    locale: 'en-US',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    ...matrix.map(({ name, width, height }) => ({ name, use: { viewport: { width, height } } })),
    { name: 'narrow', use: { viewport: { width: 360, height: 800 } } },
    { name: 'touch', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'landscape', use: { viewport: { width: 844, height: 390 } } },
  ],
  // The Founder starts the local server; CI starts its own production server.
});
