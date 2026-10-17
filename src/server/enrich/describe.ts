// mapTextToTopics, wave 1: instant keyword mapping of the reader's own words to taxonomy slugs, with
// negation ("no showbiz" → blocked). The Gemini path is stretch S1; the §9.3 signature stays unchanged.
// Also the hook for wave 2's "Tell your editor" (L7).
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { loadTopics } from '@/server/nlp/topics';

const MAX_PICKS = 8;
const MAX_BLOCKED = 5;
const NEGATIONS = new Set(['not', 'no', 'hate', 'dislike', "don't", 'dont', 'never', 'except', 'without', 'avoid', 'skip']);
const NEGATION_WINDOW = 3;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A topic's terms: its name split on "&" and ",", its synonyms, and its last slug segment ("web-dev" → "web dev"). */
function termsFor(t: TopicNode): string[] {
  const name = t.name.toLowerCase().split(/[&,]/).map((s) => s.trim());
  const last = t.slug.split('.').pop()!.replace(/-/g, ' ');
  return [...new Set([...name, ...t.synonyms.map((s) => s.toLowerCase().trim()), last].filter((s) => s.length > 1))];
}

const tokensBefore = (text: string, index: number) => text.slice(0, index).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);

export function keywordTopics(text: string, topics: TopicNode[]): { picks: TopicSlug[]; blocked: TopicSlug[] } {
  const lower = text.toLowerCase().replace(/[’‘]/g, "'");
  const found: { slug: TopicSlug; at: number; negated: boolean }[] = [];
  for (const t of topics) {
    let first = Infinity;
    let positive = false;
    let negative = false;
    for (const term of termsFor(t)) {
      for (const m of lower.matchAll(new RegExp(`(?<![a-z0-9])${escapeRegex(term)}(?![a-z0-9])`, 'g'))) {
        const index = m.index ?? 0;
        first = Math.min(first, index);
        const window = tokensBefore(lower, index).slice(-NEGATION_WINDOW);
        if (window.some((w) => NEGATIONS.has(w))) negative = true;
        else positive = true;
      }
    }
    // A topic the reader also mentions positively is a pick, never blocked.
    if (positive || negative) found.push({ slug: t.slug, at: first, negated: !positive });
  }
  found.sort((a, b) => a.at - b.at);
  return {
    picks: found.filter((f) => !f.negated).map((f) => f.slug).slice(0, MAX_PICKS),
    blocked: found.filter((f) => f.negated).map((f) => f.slug).slice(0, MAX_BLOCKED),
  };
}

export async function mapTextToTopics(text: string): Promise<{ picks: TopicSlug[]; blocked: TopicSlug[]; provider: 'gemini' | 'keyword' }> {
  try {
    return { ...keywordTopics(text, await loadTopics()), provider: 'keyword' };
  } catch (err) {
    console.warn(`[enrich] mapTextToTopics: topics unavailable (${err instanceof Error ? err.message : String(err)})`);
    return { picks: [], blocked: [], provider: 'keyword' };
  }
}
