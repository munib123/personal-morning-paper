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

/**
 * Loves cricket and AI, has a hidden interest in space, dislikes showbiz. Her onboarding is an imperfect
 * self-report: she picks Sports and Technical (broad), never picks Science (so space is hidden), and picked
 * Sports for the cricket: the rest of sport she rarely reads (0.15). Everything else is mildly readable (0.30).
 */
export const AYESHA: Persona = {
  name: 'Ayesha',
  picks: ['sports', 'technical'],
  trueAffinity: {
    'sports.cricket': 0.95,
    'technical.cs.ai-ml': 0.9,
    'science.space': 0.8, // hidden: she never picked Science
    sports: 0.15, // picked, but outside cricket she rarely reads sport
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
