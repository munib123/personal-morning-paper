// Visible learning (§9.3 getLearningView): the reader's weights, what moved since a snapshot, one
// Morrow-voice sentence, and a timeline. Plus the /me edits (pin, mute, set) through the signal pipeline.
import type { InterestState, RankParams, UserModel } from '@/contracts/engine';
import type { LearningView } from '@/contracts/learning';
import type { InterestWeight } from '@/contracts/profile';
import type { SignalEvent, SignalType, WeightDelta } from '@/contracts/signals';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { FIXTURE_LEARNING } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { earliestSnapshot, snapshotBefore } from '@/server/edition/db';
import { moversSentence } from '@/server/edition/note';
import { loadTaxonomy } from '@/server/edition/taxonomy';
import { getProfile, isFixtureUser } from '@/server/profile';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { addDays, localDate } from '@/server/time';
import { processSignals } from './signals';
import { loadUserModel } from './store';
import { thetaOf } from './theta';

const STILL_LEARNING = 'Your paper is still learning. Read or skip a few stories and this will change.';
const MIN_MOVE = 0.02;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** One sentence: "More {A} and {B}, less {C}, based on what you read." (or the still-learning line). */
export function changeSummary(movers: WeightDelta[]): string {
  return moversSentence(movers) || STILL_LEARNING;
}

const unpicked = (params: RankParams): InterestState => {
  const [a, b] = params.priors.unpicked;
  return { alpha: a, beta: b, priorAlpha: a, priorBeta: b, picked: false, muted: false, pinned: false };
};

/** Every taxonomy node, in taxonomy order, with its blended θ̂. */
export function toInterestWeights(model: UserModel, taxonomy: TopicNode[], params: RankParams): InterestWeight[] {
  return taxonomy.map((t) => {
    const s = model.interests[t.slug] ?? unpicked(params);
    return { slug: t.slug, name: t.name, level: t.level, theta: r4(thetaOf(model, t.slug, params)), alpha: s.alpha, beta: s.beta, picked: s.picked, muted: s.muted, pinned: s.pinned };
  });
}

export async function getLearningView(userId: string, sinceDays: number, now: Date): Promise<LearningView> {
  if (isFixtureUser(userId)) return FIXTURE_LEARNING;
  const profile = await getProfile(userId);
  const today = localDate(now, profile?.tz ?? 'Asia/Karachi');
  const [model, taxonomy, snap, timeline] = await Promise.all([
    loadUserModel(userId, { targetDate: today }),
    loadTaxonomy(),
    snapshotBefore(userId, addDays(today, -sinceDays), true).then((s) => s ?? earliestSnapshot(userId)),
    createSupabaseAdminClient().from('events').select('type, occurred_at, meta, articles(headline, title)').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(20),
  ]);
  if (timeline.error) throw new Error(`getLearningView timeline: ${timeline.error.message}`);
  const weights = toInterestWeights(model, taxonomy, DEFAULT_PARAMS);
  const current = Object.fromEntries(weights.map((w) => [w.slug, w.theta]));
  const names = new Map(taxonomy.map((t) => [t.slug, t.name]));
  const movers: WeightDelta[] = snap
    ? Object.keys(current)
        .filter((s) => typeof snap.weights[s] === 'number' && Math.abs(current[s] - snap.weights[s]) >= MIN_MOVE)
        .map((s) => ({ slug: s, name: names.get(s) ?? s, before: snap.weights[s], after: current[s] }))
        .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || (a.slug < b.slug ? -1 : 1))
        .slice(0, 5)
    : [];
  return {
    weights,
    movers,
    changeSummary: changeSummary(movers),
    sinceDate: snap?.date ?? today,
    timeline: ((timeline.data ?? []) as unknown as { type: SignalType; occurred_at: string; meta: unknown; articles: { headline: string | null; title: string } | null }[]).map((e) => {
      const meta = (e.meta && typeof e.meta === 'object' ? e.meta : {}) as Record<string, unknown>;
      return { at: e.occurred_at, type: e.type, headline: e.articles ? (e.articles.headline ?? e.articles.title) : null, effect: typeof meta.effect === 'string' ? meta.effect : e.type };
    }),
  };
}

export interface InterestEdit {
  slug: TopicSlug;
  action: 'pin' | 'unpin' | 'mute' | 'unmute' | 'set';
  value?: number;
}

/** pin / unpin / mute / unmute flip a flag; set moves the weight to `value`, keeping the mass α + β. */
export async function editInterest(userId: string, edit: InterestEdit, now: Date): Promise<InterestWeight[]> {
  const db = createSupabaseAdminClient();
  const r = await db.from('user_interests').select('slug, alpha, beta, prior_alpha, prior_beta, picked, muted, pinned').eq('user_id', userId).eq('slug', edit.slug).maybeSingle();
  if (r.error) throw new Error(`editInterest: ${r.error.message}`);
  const row = r.data as { alpha: number; beta: number; prior_alpha: number; prior_beta: number; picked: boolean; muted: boolean; pinned: boolean } | null;
  const s: InterestState = row
    ? { alpha: row.alpha, beta: row.beta, priorAlpha: row.prior_alpha, priorBeta: row.prior_beta, picked: row.picked, muted: row.muted, pinned: row.pinned }
    : unpicked(DEFAULT_PARAMS);
  let next: InterestState = s;
  if (edit.action === 'pin' || edit.action === 'unpin') next = { ...s, pinned: edit.action === 'pin' };
  if (edit.action === 'mute' || edit.action === 'unmute') next = { ...s, muted: edit.action === 'mute' };
  if (edit.action === 'set') {
    const v = Math.min(1, Math.max(0, edit.value ?? 0.5));
    const n = s.alpha + s.beta;
    const MIN = 0.05; // α and β stay positive: Beta(0, ·) has no Thompson sample and fails the contract
    const alpha = Math.min(n - MIN, Math.max(MIN, v * n));
    // The refold restarts from the prior, so the reader's choice is written into the prior too.
    next = { ...s, alpha, beta: n - alpha, priorAlpha: alpha, priorBeta: n - alpha };
  }
  const up = await db.from('user_interests').upsert(
    { user_id: userId, slug: edit.slug, alpha: next.alpha, beta: next.beta, prior_alpha: next.priorAlpha, prior_beta: next.priorBeta, picked: next.picked, muted: next.muted, pinned: next.pinned },
    { onConflict: 'user_id,slug' },
  );
  if (up.error) throw new Error(`editInterest upsert: ${up.error.message}`);

  const ev: SignalEvent = { type: 'weight_edit', meta: { slug: edit.slug, action: edit.action } };
  if (edit.action === 'set') ev.value = edit.value;
  await processSignals(userId, [ev], now);

  const [model, taxonomy] = await Promise.all([loadUserModel(userId), loadTaxonomy()]);
  return toInterestWeights(model, taxonomy, DEFAULT_PARAMS);
}
