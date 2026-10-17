// W2-shipkit: a LearningView for the persona derived from her stored rows (user_interests, interest_snapshots,
// events) with L3's own pure functions, for as long as getLearningView is still the L0 stub. PURE.
import type { ArticleCard } from '@/contracts/article';
import type { Candidate, RankParams, UserModel } from '@/contracts/engine';
import type { LearningView } from '@/contracts/learning';
import type { InterestWeight } from '@/contracts/profile';
import type { SignalEvent } from '@/contracts/signals';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { moversBetween } from '@/server/edition/build';
import { moversSentence } from '@/server/edition/note';
import { applySignal, withNames } from '@/server/learn/signal';
import { thetaOf } from '@/server/learn/theta';
import { DEFAULT_PARAMS } from '@/server/rank/params';
import { addDays } from '@/server/time';
import type { SnapshotEvent, SnapshotInterest } from './schema';

const TIMELINE_MAX = 20;
const WPM = 230;
const NO_CHANGE = 'No change';
const CALM_SUMMARY = 'Your paper is still learning from what you read.';

export interface LearningInput {
  interests: SnapshotInterest[];
  snapshots: { date: string; weights: Record<TopicSlug, number> }[];
  events: SnapshotEvent[]; // any order; newest first in the result
  articles: Map<string, ArticleCard>;
  taxonomy: TopicNode[];
  today: string; // 'YYYY-MM-DD'
  sinceDays: number;
  params?: RankParams;
}

/** An engine Candidate from an ArticleCard (no embedding: the snapshot strips vectors). */
export function candidateFromCard(card: ArticleCard, importance = 0): Candidate {
  return {
    id: card.id,
    embedding: null,
    labels: card.labels,
    clusterId: card.clusterId,
    importance,
    sourceCount: 1 + card.alsoCoveredBy.length,
    publishedAt: card.publishedAt,
    sourceId: card.sourceId,
    sourceQuality: 0.5,
    wordCount: card.readingMinutes * WPM,
    hasImage: !!card.imageUrl,
    headline: card.headline,
  };
}

function modelFrom(interests: SnapshotInterest[]): UserModel {
  const model: UserModel = {
    userId: 'snapshot',
    interests: {},
    pos: null,
    neg: null,
    nEngaged: 0,
    depthPref: 0,
    presentation: { timeBudget: 15, depth: 'basics', lang: 'en' },
    seenArticleIds: [],
    dismissedClusterIds: [],
    mutedSourceIds: [],
    engaged: [],
  };
  for (const r of interests) {
    model.interests[r.slug] = { alpha: r.alpha, beta: r.beta, priorAlpha: r.priorAlpha, priorBeta: r.priorBeta, picked: r.picked, muted: r.muted, pinned: r.pinned };
  }
  return model;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

function toSignal(e: SnapshotEvent): SignalEvent {
  const ev: SignalEvent = { type: e.type };
  if (e.articleId) ev.articleId = e.articleId;
  if (e.editionId) ev.editionId = e.editionId;
  if (e.value !== null) ev.value = e.value;
  const meta: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(e.meta)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
  if (Object.keys(meta).length > 0) ev.meta = meta;
  return ev;
}

/**
 * "{Topic} +2%": the signal's effect on the story's own first label (else on whatever it moved most),
 * measured on the current model; or a calm constant when it changes nothing.
 */
function effectOf(e: SnapshotEvent, article: ArticleCard | undefined, model: UserModel, taxonomy: TopicNode[], params: RankParams): string {
  if (e.type === 'pdf_download') return 'Every story in the paper, slightly up';
  if (!article) return NO_CHANGE;
  const { deltas } = applySignal(model, toSignal(e), candidateFromCard(article), params);
  const named = withNames(deltas, taxonomy).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const top = named.find((d) => d.slug === article.labels[0]?.slug && d.after !== d.before) ?? named[0];
  if (!top) return NO_CHANGE;
  const pct = Math.round((top.after - top.before) * 1000) / 10;
  if (pct === 0) return NO_CHANGE;
  return `${top.name} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
}

export function deriveLearningView(i: LearningInput): LearningView {
  const params = i.params ?? DEFAULT_PARAMS;
  const nodes = new Map(i.taxonomy.map((t) => [t.slug, t]));
  const model = modelFrom(i.interests);

  const weights: InterestWeight[] = i.interests
    .filter((r) => nodes.has(r.slug))
    .map((r) => {
      const node = nodes.get(r.slug)!;
      return {
        slug: r.slug,
        name: node.name,
        level: node.level,
        theta: clamp01(thetaOf(model, r.slug, params)),
        alpha: r.alpha,
        beta: r.beta,
        picked: r.picked,
        muted: r.muted,
        pinned: r.pinned,
      };
    })
    .sort((a, b) => b.theta - a.theta || a.slug.localeCompare(b.slug));

  const sinceDate = addDays(i.today, -i.sinceDays);
  const current: Record<TopicSlug, number> = Object.fromEntries(weights.map((w) => [w.slug, round4(w.theta)]));
  const byDateAsc = [...i.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const baseline = [...byDateAsc].reverse().find((s) => s.date <= sinceDate) ?? byDateAsc[0] ?? null;
  const movers = withNames(moversBetween(baseline?.weights ?? null, current, i.taxonomy, 5), i.taxonomy);

  const timeline = [...i.events]
    .filter((e) => e.type !== 'impression')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, TIMELINE_MAX)
    .map((e) => {
      const article = e.articleId ? i.articles.get(e.articleId) : undefined;
      return { at: e.at, type: e.type, headline: article?.headline ?? null, effect: effectOf(e, article, model, i.taxonomy, params) };
    });

  return { weights, movers, changeSummary: moversSentence(movers) || CALM_SUMMARY, sinceDate, timeline };
}
