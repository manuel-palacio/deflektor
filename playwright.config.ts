import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5190' },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] }, testIgnore: ['iphone.spec.ts'] },
    {
      // Safari's engine on an iPhone profile: runs the phone-specific specs only.
      name: 'iphone-safari',
      use: { ...devices['iPhone 15'] },
      testMatch: ['iphone.spec.ts'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
  },
});
