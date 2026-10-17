// Layout and tiers for rank-v1 (ARCHITECTURE §10.4). PURE.
//   rank 1 lead · 2–4 top · core grouped by section (Σs desc) · Beyond your usual (bigstory, explore, serendipity)
import type { RankParams, UserModel } from '@/contracts/engine';
import type { Slot } from '@/contracts/edition';
import type { Tier } from '@/contracts/article';
import type { TimeBudget } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';
import { RANK_V1_FIXED } from './params';
import { byScore, type Scored } from './select';

/** A selected story before layout: its selection slot, plus the node an explore draw chose. */
export interface Pick {
  s: Scored;
  slot: Slot; // 'core' | 'bigstory' | 'explore' | 'serendipity'
  exploreSlug?: TopicSlug;
}

/** A story in its final place: `slot` is the layout slot, `origin` the selection slot (kept for the chip). */
export interface Placed extends Pick {
  origin: Slot;
}

const TIERS: Tier[] = ['brief', 'std', 'deep'];
const clampTier = (i: number): Tier => TIERS[Math.max(0, Math.min(2, i))];

/** Standard rule (θ ≥ 0.70 deep, ≥ 0.40 std, else brief) shifted by depthPref; Deep (30) shifts up one more. */
export function baseTier(theta: number, depthPref: -1 | 0 | 1, budget: TimeBudget, params: RankParams): Tier {
  let i = theta >= params.tiers.deep ? 2 : theta >= params.tiers.std ? 1 : 0;
  i += depthPref;
  if (budget === 30) i += 1;
  return clampTier(i);
}

const cap = (t: Tier, max: Tier): Tier => (TIERS.indexOf(t) > TIERS.indexOf(max) ? max : t);

/**
 * Tiers for the ordered edition (index 0 = the lead, always deep) and its reserve.
 * Quick (5): the 4 stories after the lead keep at most std, the rest are brief; the reserve is capped at std.
 */
export function assignTiers(items: Placed[], reserve: Scored[], u: UserModel, params: RankParams, itemTheta: (s: Scored) => number): { items: Tier[]; reserve: Tier[] } {
  const budget = u.presentation.timeBudget;
  const tierOf = (s: Scored) => baseTier(itemTheta(s), u.depthPref, budget, params);
  const itemTiers = items.map((p, i) => {
    if (i === 0) return 'deep' as const;
    const t = tierOf(p.s);
    if (budget !== 5) return t;
    return i <= 4 ? cap(t, 'std') : 'brief';
  });
  const reserveTiers = reserve.map((s) => (budget === 5 ? cap(tierOf(s), 'std') : tierOf(s)));
  return { items: itemTiers, reserve: reserveTiers };
}

/**
 * Lead = argmax s·(1+importance) among stories with an image and importance ≥ 0.5, else the top core
 * story. Top = the next 3 core stories by s. Core is grouped by section, sections ordered by Σs; the
 * Beyond-your-usual stories close the paper (a special story that became the lead keeps its chip).
 */
export function layout(picks: Pick[]): { ordered: Placed[]; sectionOrder: TopicSlug[] } {
  if (picks.length === 0) return { ordered: [], sectionOrder: [] };
  const leadScore = (p: Pick) => p.s.b.total * (1 + p.s.c.importance);
  const leadCands = picks.filter((p) => p.s.c.hasImage && p.s.c.importance >= RANK_V1_FIXED.leadMinImportance);
  const core = picks.filter((p) => p.slot === 'core').sort((a, b) => byScore(a.s, b.s));
  let lead: Pick | undefined;
  for (const p of leadCands) {
    if (!lead || leadScore(p) > leadScore(lead) || (leadScore(p) === leadScore(lead) && byScore(p.s, lead.s) < 0)) lead = p;
  }
  lead ??= core[0] ?? [...picks].sort((a, b) => byScore(a.s, b.s))[0];
  const restCore = core.filter((p) => p !== lead);
  const top = restCore.slice(0, 3);
  const body = restCore.slice(3);

  const sums = new Map<TopicSlug, number>();
  for (const p of body) sums.set(p.s.root, (sums.get(p.s.root) ?? 0) + p.s.b.total);
  const sectionOrder = [...sums.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([slug]) => slug);
  const grouped = sectionOrder.flatMap((sec) => body.filter((p) => p.s.root === sec));

  const beyondOrder: Slot[] = ['bigstory', 'explore', 'serendipity'];
  const beyond = beyondOrder.flatMap((slot) => picks.filter((p) => p.slot === slot && p !== lead));

  const ordered: Placed[] = [
    { ...lead, origin: lead.slot, slot: 'lead' },
    ...top.map((p): Placed => ({ ...p, origin: p.slot, slot: 'top' })),
    ...grouped.map((p): Placed => ({ ...p, origin: p.slot, slot: 'core' })),
    ...beyond.map((p): Placed => ({ ...p, origin: p.slot })),
  ];
  return { ordered, sectionOrder };
}
