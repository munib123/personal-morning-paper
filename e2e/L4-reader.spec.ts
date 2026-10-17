// L4 Reader UI end-to-end checks on the DEMO_MODE preview edition (no sign-in needed):
//   PLAYWRIGHT_BASE_URL=http://localhost:3004 npx playwright test e2e/L4-reader.spec.ts
import { expect, test, type Page } from '@playwright/test';

const PREVIEW = '/today/preview';

async function fresh(page: Page, view: 'front' | 'bytes') {
  await page.goto(`${PREVIEW}?view=${view}`);
  await page.evaluate(() => localStorage.clear()); // skips and reads persist per edition
  await page.reload();
}

test('Bytes: j, x + Undo, o + Escape, b', async ({ page }) => {
  await fresh(page, 'bytes');
  const deck = page.getByRole('region', { name: "Today's stories, one at a time" });
  const slides = deck.locator('[data-slide]');
  await expect(slides.nth(0)).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('j');
  await expect(slides.nth(1)).toHaveAttribute('aria-current', 'true');
  const headline = (await slides.nth(1).locator('h3').textContent())?.trim() ?? '';
  expect(headline).not.toBe('');

  await page.keyboard.press('x');
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  await expect(slides.nth(1).locator('h3')).not.toHaveText(headline);
  await undo.click();
  await expect(slides.nth(1).locator('h3')).toHaveText(headline);

  await page.keyboard.press('o');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.keyboard.press('b');
  await expect(page.getByRole('heading', { name: 'Three things to know' })).toBeVisible();
});

test('Front page: keyboard reaches the view toggle, the lead headline and its feedback, with a focus ring', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page, 'front');
  const leadHeadline = ((await page.locator('[data-slot="lead"] h3').textContent()) ?? '').trim();
  const seen: { tag: string; name: string | null; text: string; ring: boolean }[] = [];
  for (let i = 0; i < 40 && !seen.some((s) => s.tag === 'BUTTON' && s.text === 'More like this'); i++) {
    await page.keyboard.press('Tab');
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { tag: '', name: null, text: '', ring: false };
        const style = getComputedStyle(el);
        const ring = style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && style.outlineWidth !== '0px');
        return { tag: el.tagName, name: el.getAttribute('name'), text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(), ring };
      }),
    );
  }
  expect(seen.some((s) => s.tag === 'INPUT' && s.name === 'view-full')).toBe(true);
  const link = seen.find((s) => s.tag === 'A' && s.text === leadHeadline);
  expect(link, 'the lead headline link takes focus').toBeTruthy();
  expect(link?.ring).toBe(true);
  const more = seen.find((s) => s.tag === 'BUTTON' && s.text === 'More like this');
  expect(more, 'the lead FeedbackBar takes focus').toBeTruthy();
  expect(more?.ring).toBe(true);
});

test('Front page: More shows the note, the compact masthead follows the scroll, the receipt opens', async ({ page }) => {
  await fresh(page, 'front');
  await page.locator('[data-slot="lead"]').getByRole('button', { name: 'More like this' }).click();
  await expect(page.getByText(/Got it\. More .+ tomorrow\./).first()).toBeVisible();

  await page.mouse.wheel(0, 1600);
  const compact = page.locator('[data-masthead="compact"]');
  await expect(compact).toBeVisible();
  await expect(compact.getByText('0 of 20 read')).toBeVisible();

  await page.getByRole('link', { name: 'How this paper was made' }).click();
  const panel = page.locator('#how-this-paper-was-made');
  await expect(panel).toHaveAttribute('open', '');
  await expect(panel.getByText(/LLM calls for you/)).toBeVisible();
});

test('signals are posted to /api/events', async ({ page }) => {
  await fresh(page, 'front');
  const posted = page.waitForRequest((r) => r.url().endsWith('/api/events') && r.method() === 'POST', { timeout: 15_000 });
  await page.locator('[data-slot="lead"]').getByRole('button', { name: 'Save' }).click();
  const request = await posted;
  const body = request.postDataJSON() as { events: { type: string }[] };
  expect(body.events.length).toBeGreaterThan(0);
});

test('a hostile outbound link or a bad date is a 404', async ({ request }) => {
  expect((await request.get('/r/not-a-uuid', { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get('/paper/2026-13-99', { maxRedirects: 0 })).status()).toBe(404);
});
