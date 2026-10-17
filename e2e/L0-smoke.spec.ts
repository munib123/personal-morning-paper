// L0 smoke: every top-level page answers 200 and renders an <h1>. Needs a dev server (not in CI):
//   npm run e2e -- e2e/L0-smoke.spec.ts
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/start', '/today', '/archive', '/me', '/paper/2026-10-17', '/paper/2026-10-17/print'];

for (const path of PAGES) {
  test(`${path} returns 200 and shows an h1`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), `status of ${path}`).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
  });
}
