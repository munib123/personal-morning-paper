// W2 "Tell your editor" on the real database (RUN_DB_TESTS=1 only, like L3's build.int.test.ts):
// a throwaway onboarded reader → tellEditor → applyEditorChanges → the blended θ̂ lands on each proposed
// `after`, and today's paper is rebuilt. GEMINI_API_KEY is blanked: the keyword path and the template
// note, so the run spends no Gemini quota. The reader is deleted afterwards (rows cascade).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OnboardingInput } from '@/contracts/profile';

const run = process.env.RUN_DB_TESTS === '1';
if (run) {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // CI provides the env directly
  }
}

const onboarding = (slugs: string[]): OnboardingInput => ({
  displayName: 'W2 Editor',
  paperName: null,
  picks: slugs.map((slug) => ({ slug, via: 'tile' as const })),
  blocked: [],
  taste: [],
  presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
  city: 'Islamabad',
  tz: 'Asia/Karachi',
});

describe.skipIf(!run)('tell your editor on the real database (throwaway reader)', () => {
  let userId = '';

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = '';
    const { createSupabaseAdminClient } = await import('@/server/db/admin');
    const { priorsFromOnboarding, saveUserModel } = await import('@/server/learn');
    const { loadTaxonomy } = await import('@/server/edition');
    const { DEFAULT_PARAMS } = await import('@/server/rank');
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email: `w2-editor-${Date.now()}@subah.test`, password: crypto.randomUUID(), email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    userId = data.user.id;
    const p = await admin
      .from('profiles')
      .insert({ user_id: userId, display_name: 'W2 Editor', paper_name: 'The Morrow', tz: 'Asia/Karachi', city: 'Islamabad', time_budget: 15, onboarded_at: new Date().toISOString() });
    if (p.error) throw new Error(`profile: ${p.error.message}`);
    const interests = priorsFromOnboarding(onboarding(['sports', 'entertainment']), await loadTaxonomy(), DEFAULT_PARAMS);
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

  it('proposes from the words, applies through editInterest, and rebuilds today with the change', async () => {
    const { applyEditorChanges, tellEditor } = await import('@/server/editor');
    const { getEdition, loadTaxonomy } = await import('@/server/edition');
    const { loadUserModel, toInterestWeights } = await import('@/server/learn');
    const { DEFAULT_PARAMS } = await import('@/server/rank');
    const now = new Date();

    const t0 = performance.now();
    const proposal = await tellEditor(userId, 'more cricket, less football, never gaming, and I am curious about astronomy', now);
    const tellMs = Math.round(performance.now() - t0);
    expect(proposal.provider).toBe('keyword');
    const actions = Object.fromEntries(proposal.changes.map((c) => [c.slug, c.action]));
    expect(actions).toMatchObject({ 'sports.cricket': 'raise', 'sports.football': 'lower', 'entertainment.gaming': 'mute', 'science.space': 'add' });

    const t1 = performance.now();
    const r = await applyEditorChanges(userId, proposal.changes, now);
    const applyMs = Math.round(performance.now() - t1);
    expect(r.changed).toBe(proposal.changes.length);
    expect(r.number).toBeGreaterThanOrEqual(1);
    expect(r.leadHeadline.length).toBeGreaterThan(0);

    const weights = new Map(toInterestWeights(await loadUserModel(userId), await loadTaxonomy(), DEFAULT_PARAMS).map((w) => [w.slug, w]));
    for (const c of proposal.changes) {
      const w = weights.get(c.slug)!;
      if (c.action === 'mute') expect(w.muted).toBe(true);
      else if (c.action === 'pin') expect(w.pinned).toBe(true);
      else expect(Math.abs(w.theta - c.after), `${c.slug} θ̂ ${w.theta} vs proposed ${c.after}`).toBeLessThan(0.02);
    }
    const edition = await getEdition(userId, r.date);
    expect(edition?.items).toHaveLength(20);
    expect(edition?.items.some((i) => i.sectionSlug.startsWith('entertainment.gaming'))).toBe(false);
    console.log(`[W2 int] tell ${tellMs} ms, apply+rebuild ${applyMs} ms, changes ${JSON.stringify(proposal.changes.map((c) => [c.name, c.action, c.before, c.after]))}, lead "${r.leadHeadline}"`);
  }, 120_000);
});
