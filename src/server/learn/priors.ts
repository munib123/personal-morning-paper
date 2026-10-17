// Onboarding priors (ARCHITECTURE §10.4). PURE.
//   picked L1 (2,1) · picked L2 (3,1) · picked L3 (4,1) · unpicked (1,3) · blocked → muted
//   an unpicked child of a picked node: α += 0.5·(α_parent − 1)
import type { InterestState, RankParams } from '@/contracts/engine';
import type { OnboardingInput } from '@/contracts/profile';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { normalize } from '@/server/rank/vec';
import { meanOf } from './theta';

export function priorsFromOnboarding(input: OnboardingInput, taxonomy: TopicNode[], params: RankParams): Record<TopicSlug, InterestState> {
  const picked = new Set(input.picks.map((p) => p.slug));
  const blocked = new Set(input.blocked);
  const pickedPrior = (level: 1 | 2 | 3): [number, number] =>
    level === 1 ? params.priors.pickedL1 : level === 2 ? params.priors.pickedL2 : params.priors.pickedL3;
  const bySlug = new Map(taxonomy.map((t) => [t.slug, t]));
  const out: Record<TopicSlug, InterestState> = {};
  for (const t of taxonomy) {
    const isPicked = picked.has(t.slug);
    const [alpha0, beta] = isPicked ? pickedPrior(t.level) : params.priors.unpicked;
    let alpha = alpha0;
    if (!isPicked && t.parentSlug && picked.has(t.parentSlug)) {
      const parent = bySlug.get(t.parentSlug);
      if (parent) alpha += params.propagation.parentToChild * (pickedPrior(parent.level)[0] - 1);
    }
    out[t.slug] = { alpha, beta, priorAlpha: alpha, priorBeta: beta, picked: isPicked, muted: blocked.has(t.slug), pinned: false };
  }
  return out;
}

/** Cold-start profile embedding: normalize(Σ mean × topic embedding) over picked nodes; null without any. */
export function coldStartPos(interests: Record<TopicSlug, InterestState>, topicEmb: Record<TopicSlug, Float32Array>): Float32Array | null {
  let acc: Float32Array | null = null;
  for (const [slug, s] of Object.entries(interests)) {
    const e = topicEmb[slug];
    if (!s.picked || !e) continue;
    if (!acc) acc = new Float32Array(e.length);
    if (e.length !== acc.length) continue;
    const m = meanOf(s);
    for (let i = 0; i < e.length; i++) acc[i] += m * e[i];
  }
  return acc ? normalize(acc) : null;
}
