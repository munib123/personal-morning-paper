// Zero-shot topic labels (ARCHITECTURE §10.2): cosine against the topic embeddings, restricted to the
// subtrees of the source's prior topics (global search when the best is under 0.30), top 3,
// conf = softmax(cos / 0.05) over the kept ones, most specific first. Pure, no I/O.
import type { TopicSlug } from '@/contracts/taxonomy';
import { cosine } from './vector';

export interface TopicVec { slug: TopicSlug; level: 1 | 2 | 3; embedding: Float32Array }

export const LABEL_MIN_COS = 0.3;
export const LABEL_TEMPERATURE = 0.05;
export const LABEL_TOP_K = 3;
// gte-small's cosines are compressed (unrelated texts score ≈ 0.75), so LABEL_MIN_COS never fires. On the
// first real corpus, when the global best beat the best prior-subtree topic by ≥ 0.03 (516 of 1,805
// articles), the global label was almost always the right one (a sports feed carrying world news).
export const PRIOR_MAX_GAP = 0.03;
const MIN_CONF = 0.05;

const inSubtree = (slug: TopicSlug, prior: TopicSlug) => slug === prior || slug.startsWith(`${prior}.`);

export function assignLabels(
  e: Float32Array,
  topics: TopicVec[],
  priors: TopicSlug[],
  opts: { minCos?: number; temp?: number; k?: number; maxGap?: number } = {},
): { slug: TopicSlug; conf: number }[] {
  const minCos = opts.minCos ?? LABEL_MIN_COS;
  const temp = opts.temp ?? LABEL_TEMPERATURE;
  const k = opts.k ?? LABEL_TOP_K;
  const maxGap = opts.maxGap ?? PRIOR_MAX_GAP;

  const scored = topics.map((t) => ({ t, cos: cosine(e, t.embedding) })).sort((a, b) => b.cos - a.cos);
  if (scored.length === 0) return [];

  let candidates = priors.length > 0 ? scored.filter((s) => priors.some((p) => inSubtree(s.t.slug, p))) : scored;
  if (candidates.length === 0 || candidates[0].cos < minCos || scored[0].cos - candidates[0].cos >= maxGap) candidates = scored;

  const kept = candidates.slice(0, k);
  const best = kept[0].cos;
  // Shift by the best cos before exponentiating: the same softmax, without overflow.
  const weights = kept.map((s) => Math.exp((s.cos - best) / temp));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const withConf = kept.map((s, i) => ({ t: s.t, conf: weights[i] / total }));

  // Drop labels under 0.05 conf (the best one always stays), then renormalize.
  const survivors = withConf.filter((l, i) => i === 0 || l.conf >= MIN_CONF);
  const sum = survivors.reduce((s, l) => s + l.conf, 0);

  return survivors
    .map((l) => ({ slug: l.t.slug, level: l.t.level, conf: l.conf / sum }))
    .sort((a, b) => b.level - a.level || b.conf - a.conf)
    .map(({ slug, conf }) => ({ slug, conf }));
}
