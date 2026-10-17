// Onboarding (§9.2 POST /api/onboarding): profile + priors + cold-start embedding, then the first paper.
import type { OnboardingInput } from '@/contracts/profile';
import type { SignalEvent } from '@/contracts/signals';
import { BRAND } from '@/lib/brand';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { toPgVector } from '@/server/db/vector';
import { buildEdition, loadTaxonomy, loadTopicEmbeddings } from '@/server/edition';
import { coldStartPos, priorsFromOnboarding, processSignals, saveUserModel } from '@/server/learn';
import { DEFAULT_PARAMS } from '@/server/rank';

export async function onboardUser(userId: string, input: OnboardingInput, now: Date): Promise<{ editionDate: string }> {
  const [taxonomy, topicEmb] = await Promise.all([loadTaxonomy(), loadTopicEmbeddings().catch(() => ({}))]);
  const interests = priorsFromOnboarding(input, taxonomy, DEFAULT_PARAMS);
  const pos = coldStartPos(interests, topicEmb);

  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        display_name: input.displayName,
        paper_name: input.paperName?.trim() || BRAND.defaultPaperName(input.displayName),
        tz: input.tz,
        city: input.city,
        time_budget: input.presentation.timeBudget,
        depth: input.presentation.depth,
        lang: input.presentation.lang,
        pos_emb: pos ? toPgVector(pos) : null,
        onboarded_at: now.toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`onboardUser profile: ${error.message}`);

  await saveUserModel({
    userId,
    interests,
    pos,
    neg: null,
    nEngaged: 0,
    depthPref: 0,
    presentation: input.presentation,
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
  });

  // Morrow onboarding sends taste: [] — this path stays for contract compatibility. Unknown articles are
  // stored without an article_id and teach nothing; a failure here never blocks the first paper.
  const taste: SignalEvent[] = input.taste
    .filter((t) => t.verdict === 'more' || t.verdict === 'less')
    .map((t) => ({ type: t.verdict === 'more' ? 'taste_more' : 'taste_less', meta: { articleId: t.articleId } }));
  if (taste.length > 0) {
    try {
      await processSignals(userId, taste, now);
    } catch (e) {
      console.error('[onboarding] taste signals failed; continuing', e);
    }
  }

  const edition = await buildEdition(userId, now, { force: true });
  return { editionDate: edition.date };
}
