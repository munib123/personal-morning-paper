// Playwright (L0). Lanes add only e2e/L<n>-*.spec.ts and run them against their own dev server:
//   PLAYWRIGHT_BASE_URL=http://localhost:3005 npx playwright test e2e/L5-*.spec.ts
// Without PLAYWRIGHT_BASE_URL it starts (or reuses) `npm run dev` on :3000.
// Chromium only. With PUPPETEER_EXECUTABLE_PATH set (see .env.example) it drives the system Chrome,
// so no Playwright browser download is needed.
import { defineConfig, devices } from '@playwright/test';

import './scripts/lib/env';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseURL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromePath ? { launchOptions: { executablePath: chromePath } } : {}),
      },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : { command: 'npm run dev', port: 3000, reuseExistingServer: true, timeout: 180_000 },
});
