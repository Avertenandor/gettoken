import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: false,
    video: 'on',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  outputDir: path.join(__dirname, 'test-artifacts')
});
