// L5 onboarding, end to end at phone width (run: PLAYWRIGHT_BASE_URL=http://localhost:3005 npx playwright test e2e/L5-onboarding.spec.ts).
// Each full flow signs one guest in anonymously on the shared Supabase project, so keep runs few.
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = 'docs/handoff/screens';
const DEFAULT_SLUGS = ['news', 'technical', 'sports', 'business'];

const shot = (page: Page, n: number) => page.screenshot({ path: `${SHOTS}/L5-flow-${n}.png`, fullPage: true });
const nextButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('full flow under 90 s at 390px', async ({ page }) => {
  test.setTimeout(120_000);
  const started = Date.now();

  await page.goto('/');
  await page.getByRole('link', { name: 'Build my paper' }).click();
  // A cold dev server compiles /start on first use; give the first navigation room.
  await page.waitForURL('**/start', { timeout: 30_000 });
  await expect(page.getByText('Step 1 of 4')).toBeVisible({ timeout: 15_000 });

  // 1. Welcome: the first name goes straight into the masthead ear.
  await page.getByLabel('First name').fill('Ayesha');
  await expect(page.getByText('Prepared for Ayesha')).toBeVisible();
  await shot(page, 1);
  await nextButton(page, 'Continue').click();

  // 2. Topics: Technical → Computer Science → AI & Machine Learning, plus Cricket and All of Science.
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Show Computer Science topics' }).click();
  await page.getByRole('button', { name: 'AI & Machine Learning', exact: true }).click();
  await page.getByRole('button', { name: 'Cricket', exact: true }).click();
  await expect(nextButton(page, 'Pick 1 more')).toBeDisabled();
  await page.getByRole('button', { name: 'All of Science', exact: true }).click();
  await expect(nextButton(page, 'Continue')).toBeEnabled();
  await expect(page.getByText('3 topics picked')).toBeVisible();
  await shot(page, 2);
  await nextButton(page, 'Continue').click();

  // 3. In your words: free text becomes removable topic chips.
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await page.getByLabel('Anything else you want in your paper?').fill('more climate tech, less celebrity gossip');
  await page.getByRole('button', { name: 'Add to my topics' }).click();
  await expect(page.getByText("Added to your paper. Remove anything that's wrong.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[aria-pressed="true"]').first()).toBeVisible();
  await shot(page, 3);
  await nextButton(page, 'Continue').click();

  // 4. Your routine: a quick paper.
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await page.locator('label', { hasText: 'Quick' }).click();
  await expect(page.getByRole('radio', { name: /Quick/ })).toBeChecked();
  await shot(page, 4);
  await nextButton(page, 'Preview my paper').click();

  // 5. The first front page, then Build my paper.
  await expect(page.getByRole('heading', { name: 'A preview of your first front page' })).toBeVisible();
  await expect(page.locator('h3').first()).toBeVisible({ timeout: 15_000 });
  await shot(page, 5);
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/onboarding') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Build my paper' }).click();
  const body = (await saved).postDataJSON();
  expect(body.taste).toEqual([]);
  expect(body.paperName).toBe('The Morrow');
  expect(body.displayName).toBe('Ayesha');
  expect(body.presentation.timeBudget).toBe(5);
  expect(body.picks.map((p: { slug: string }) => p.slug)).toEqual(expect.arrayContaining(['technical.cs.ai-ml', 'sports.cricket', 'science']));
  await expect(page.getByText(/Setting today's paper/)).toBeVisible();
  await shot(page, 6);

  await page.waitForURL('**/today', { timeout: 90_000 });
  const elapsed = Date.now() - started;
  console.log(`L5 full onboarding flow: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(90_000);
});

test('skip what you can', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/start');
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await nextButton(page, 'Continue').click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await nextButton(page, 'Preview my paper').click();
  await expect(page.getByRole('heading', { name: 'A preview of your first front page' })).toBeVisible();
  const saved = page.waitForRequest((r) => r.url().endsWith('/api/onboarding') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Build my paper' }).click();
  const body = (await saved).postDataJSON();
  expect(body.picks.map((p: { slug: string }) => p.slug)).toEqual(DEFAULT_SLUGS);
  expect(body.displayName).toBeNull();
  expect(body.paperName).toBe('The Morrow');
  await page.waitForURL('**/today', { timeout: 90_000 });
});

test('draft survives reload', async ({ page }) => {
  await page.goto('/start');
  await nextButton(page, 'Continue').click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Cricket', exact: true }).click();
  await page.getByRole('button', { name: 'Football', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(2);
  await expect(nextButton(page, 'Pick 1 more')).toBeDisabled();
});
