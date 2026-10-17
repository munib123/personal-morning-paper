// A simulated reader with a hidden true-affinity vector (ARCHITECTURE §10.5 "Fast-forward 7 days").
import type { Candidate } from '@/contracts/engine';
import type { TopicSlug } from '@/contracts/taxonomy';
import { selfAndAncestors } from '@/server/rank/score';

export interface Persona {
  name: string;
  picks: TopicSlug[];
  trueAffinity: Record<TopicSlug, number>;
  defaultAffinity: number;
}

/** Loves cricket and AI, has a latent interest in space, dislikes showbiz; onboards with broad picks only. */
export const AYESHA: Persona = {
  name: 'Ayesha',
  picks: ['sports', 'technical'],
  trueAffinity: {
    'sports.cricket': 0.95,
    'technical.cs.ai-ml': 0.9,
    'science.space': 0.8, // latent: she never picked Science
    'entertainment.pakistani-showbiz': 0.05,
  },
  defaultAffinity: 0.3,
};

/** Conf-weighted mean over labels; each label takes its own or its nearest listed ancestor's affinity. */
export function trueAffinityOf(p: Persona, c: Candidate): number {
  let num = 0;
  let den = 0;
  for (const l of c.labels) {
    const hit = selfAndAncestors(l.slug).find((s) => s in p.trueAffinity);
    num += l.conf * (hit ? p.trueAffinity[hit] : p.defaultAffinity);
    den += l.conf;
  }
  return den > 0 ? num / den : p.defaultAffinity;
}
