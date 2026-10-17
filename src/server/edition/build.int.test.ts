// Real-DB test against the shared Supabase. Runs only with RUN_DB_TESTS=1:
//   RUN_DB_TESTS=1 npx vitest run src/server/edition/build.int.test.ts
// It creates its own throwaway auth user (l3-int-*@subah.test) and deletes it at the end (cascades).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditionSchema } from '@/contracts/api';
import type { OnboardingInput } from '@/contracts/profile';

const run = process.env.RUN_DB_TESTS === '1';
if (run) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // CI passes env directly
  }
}

// Never spend the shared Gemini quota from a test: the editor note stays the template.
vi.mock(import('@/server/enrich'), async (orig) => {
  const mod = await orig();
  return { ...mod, writeEditorNote: vi.fn(async () => ({ text: 'Template note (int test).', source: 'template' as const })) };
});

const input = (picks: string[]): OnboardingInput => ({
  displayName: 'L3 Int',
  paperName: null,
  picks: picks.map((slug) => ({ slug, via: 'tile' as const })),
  blocked: [],
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
});

describe.skipIf(!run)('buildEdition against the shared Supabase', () => {
  let userId = '';
  const measured: Record<string, number> = {};

  beforeAll(async () => {
    const { createSupabaseAdminClient } = await import('@/server/db/admin');
    const { priorsFromOnboarding, saveUserModel } = await import('@/server/learn');
    const { loadTaxonomy } = await import('./taxonomy');
    const { DEFAULT_PARAMS } = await import('@/server/rank');
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email: `l3-int-${Date.now()}@subah.test`, password: crypto.randomUUID(), email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    userId = data.user.id;
    const p = await admin
      .from('profiles')
      .insert({ user_id: userId, display_name: 'L3 Int', paper_name: 'The Morrow', tz: 'Asia/Karachi', city: 'Islamabad', time_budget: 15, onboarded_at: new Date().toISOString() });
    if (p.error) throw new Error(`profile: ${p.error.message}`);
    const interests = priorsFromOnboarding(input(['sports', 'technical.cs']), await loadTaxonomy(), DEFAULT_PARAMS);
    await saveUserModel({
      userId,
      interests,
      pos: null,
      neg: null,
      nEngaged: 0,
      depthPref: 0,
      presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
      seenArticleIds: [],
      dismissedClusterIds: [],
      mutedSourceIds: [],
      engaged: [],
    });
  }, 60_000);

  afterAll(async () => {
    if (!userId) return;
    const { createSupabaseAdminClient } = await import('@/server/db/admin');
    await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  }, 60_000);

  it('builds 20 + 8 with ranks 1–28, is idempotent, and a warm rebuild takes under 1.5 s', async () => {
    const { buildEdition, getEdition } = await import('./index');
    const now = new Date();
    const e = await buildEdition(userId, now, { awaitNote: true });
    measured.cold = e.receipt.buildMs;
    expect(EditionSchema.safeParse(e).success).toBe(true);
    expect(e.items).toHaveLength(20);
    expect(e.reserve).toHaveLength(8);
    expect([...e.items, ...e.reserve].map((i) => i.rank)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(e.number).toBe(1);
    expect(e.paperName).toBe('The Morrow');

    const again = await buildEdition(userId, now);
    expect(again.id).toBe(e.id);
    const stored = await getEdition(userId, e.date);
    expect(stored?.items.map((i) => i.article.id)).toEqual(e.items.map((i) => i.article.id));
    expect(EditionSchema.safeParse(stored).success).toBe(true);

    const warm = await buildEdition(userId, now, { force: true, awaitNote: true });
    measured.warm = warm.receipt.buildMs;
    expect(warm.id).toBe(e.id);
    expect(warm.number).toBe(1);
    process.stdout.write(`[L3 int] buildMs ${JSON.stringify(measured)} pool=${warm.receipt.articlesConsidered} clusters=${warm.receipt.clustersConsidered}\n`);
    expect(warm.receipt.buildMs).toBeLessThan(1500);
  }, 120_000);
});
