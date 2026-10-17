// Blended topic affinity θ̂ (ARCHITECTURE §10.4). PURE: rank/* imports this file directly.
import type { InterestState, RankParams, UserModel } from '@/contracts/engine';
import { ancestorsOf, type TopicSlug } from '@/contracts/taxonomy';

/** Posterior mean of a Beta(α, β) interest. */
export function meanOf(s: InterestState): number {
  return s.alpha / (s.alpha + s.beta);
}

/** Mean of a node, or of the pessimistic unpicked prior when the model has no row for it. */
export function nodeMean(model: UserModel, slug: TopicSlug, params: RankParams): number {
  const s = model.interests[slug];
  if (s) return meanOf(s);
  const [a, b] = params.priors.unpicked;
  return a / (a + b);
}

/**
 * θ̂(L) = 0.6·m(L) + 0.3·m(parent) + 0.1·m(grandparent), with the blend weights renormalized over the
 * levels that exist (an L1 node is just its own mean).
 */
export function thetaOf(model: UserModel, slug: TopicSlug, params: RankParams): number {
  const chain = [slug, ...ancestorsOf(slug).reverse()]; // self, parent, grandparent
  let num = 0;
  let den = 0;
  for (let i = 0; i < chain.length && i < params.blend.length; i++) {
    num += params.blend[i] * nodeMean(model, chain[i], params);
    den += params.blend[i];
  }
  return den > 0 ? num / den : nodeMean(model, slug, params);
}
