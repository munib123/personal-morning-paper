// Why-chips (ARCHITECTURE §10.4, Morrow voice §3a). The text is final copy: the reader sees it verbatim in
// the WhyTag. Calm, sentence case, "you", no exclamation marks, no emoji.
import type { RankParams, UserModel } from '@/contracts/engine';
import type { Reason, Slot } from '@/contracts/edition';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { thetaOf } from '@/server/learn/theta';
import { pinnedNodeOf, selfAndAncestors } from './score';
import type { Scored } from './select';
import { cosN, norm } from './vec';

export interface ReasonContext {
  readCounts?: Record<TopicSlug, number>; // distinct stories read per node in the last 7 days
  exploreSlug?: TopicSlug; // the node an explore draw chose
  theta?: (slug: TopicSlug) => number;
  names?: Map<TopicSlug, string>;
  engagedNorms?: number[]; // |embedding| of user.engaged[k], computed once per build
}

export const namesOf = (taxonomy: TopicNode[]): Map<TopicSlug, string> => new Map(taxonomy.map((t) => [t.slug, t.name]));

/**
 * Up to 2 chips, highest weight first. Slot chips (bigstory, explore, serendipity) weigh 1; the topic chip
 * weighs its topic contribution, the similar chip its similarity contribution, the pinned chip the pinned
 * bonus. Explore and serendipity stories carry their slot chip instead of the topic chip. With nothing to
 * say, the chip is "Fresh this morning".
 */
export function reasonsFor(item: Scored, u: UserModel, slot: Slot, taxonomy: TopicNode[], params: RankParams, ctx: ReasonContext = {}): Reason[] {
  const { c, b } = item;
  const names = ctx.names ?? namesOf(taxonomy);
  const name = (slug: TopicSlug) => names.get(slug) ?? slug;
  const theta = ctx.theta ?? ((slug: TopicSlug) => thetaOf(u, slug, params));
  const out: Reason[] = [];

  if (slot === 'bigstory') out.push({ code: 'bigstory', text: `Covered by ${c.sourceCount} outlets today`, weight: 1 });
  if (slot === 'explore' && ctx.exploreSlug) out.push({ code: 'explore', text: `Trying something new: ${name(ctx.exploreSlug)}`, weight: 1 });
  if (slot === 'serendipity') out.push({ code: 'serendipity', text: 'A step outside your usual', weight: 1 });

  if (c.labels.length > 0 && slot !== 'explore' && slot !== 'serendipity') {
    let dominant = c.labels[0];
    let dv = -Infinity;
    for (const l of c.labels) {
      const v = l.conf * theta(l.slug);
      if (v > dv) {
        dv = v;
        dominant = l;
      }
    }
    const picked = selfAndAncestors(dominant.slug).find((s) => u.interests[s]?.picked);
    const n = ctx.readCounts?.[dominant.slug] ?? 0;
    const text = picked
      ? `Because you follow ${name(picked)}`
      : n >= 2
        ? `You read ${n} stories on ${name(dominant.slug)} this week`
        : `More from ${name(dominant.slug)}`;
    out.push({ code: 'topic', text, weight: b.topic });
  }

  if (c.embedding) {
    let best: { headline: string; v: number } | null = null;
    const cn = item.norm ?? norm(c.embedding);
    for (let k = 0; k < u.engaged.length; k++) {
      const e = u.engaged[k];
      if (!e.embedding || e.articleId === c.id) continue;
      const v = cosN(c.embedding, cn, e.embedding, ctx.engagedNorms?.[k] ?? norm(e.embedding));
      if (v >= params.similarChipMinCos && (!best || v > best.v)) best = { headline: e.headline, v };
    }
    if (best) out.push({ code: 'similar', text: `Because you read "${best.headline}"`, weight: b.similarity });
  }

  const pinned = pinnedNodeOf(u, c);
  if (pinned) out.push({ code: 'pinned', text: `You pinned ${name(pinned)}`, weight: params.weights.pinnedBonus });

  if (out.length === 0) return [{ code: 'fresh', text: 'Fresh this morning', weight: b.freshness }];
  return out.sort((x, y) => y.weight - x.weight).slice(0, 2);
}
