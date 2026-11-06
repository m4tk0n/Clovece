import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://7x.wz.cz/clovece/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on',
    ...devices['Desktop Chrome'],
    launchOptions: { slowMo: Number(process.env.TEST_SLOW_MO || 250) }
  },
  outputDir: 'test-results'
});
