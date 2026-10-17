// The describe fallback (step 3, "In your words"): free text → topic slugs without any model.
// Whole-word, case- and diacritic-insensitive matches of each topic's name, the parts of a name
// joined by "&" ("AI & Machine Learning" → "ai", "machine learning") and its synonyms. The longest
// match wins where matches overlap ("pakistan cricket" beats "pakistan"), and the deepest topic wins
// on the same words. A match with "less", "no", "not", "avoid"… up to 3 words before it, in the same
// clause, is something to see less of. Pure and fast: it runs on the server and could run in the browser.
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';

const MAX = 6;
const WINDOW = 3;
const NEGATORS = new Set(['less', 'no', 'not', 'without', 'avoid', 'hate', 'hates', 'skip', 'never', 'dont', 'fewer', 'stop', 'dislike', 'nothing']);
// Words that start a new wish inside a clause: "less celebrity more cricket".
const RESETS = new Set(['more', 'but', 'plus', 'love', 'loves', 'like', 'likes', 'want', 'into', 'enjoy', 'also']);

interface Matcher { node: TopicNode; re: RegExp }
interface Hit { start: number; end: number; node: TopicNode }

/** Lower case, no diacritics, no apostrophes ("Don't" → "dont"). Keeps punctuation for clause breaks. */
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/['’]/g, '');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termsOf(n: TopicNode): string[] {
  const parts = n.name.split(/\s*[&,/]\s*/);
  const out = new Set<string>();
  for (const raw of [n.name, ...parts, ...n.synonyms]) {
    const t = normalize(raw).replace(/[^a-z0-9]+/g, ' ').trim();
    if (t.length < 2) continue;
    out.add(t);
    // Singular form, so "startups" also finds "startup"; the pattern allows a plural ending back.
    if (/ies$/.test(t)) out.add(t.replace(/ies$/, 'y'));
    else if (/[^s]s$/.test(t) && t.length > 4) out.add(t.slice(0, -1));
  }
  return [...out];
}

const cache = new WeakMap<TopicNode[], Matcher[]>();
function matchersFor(tax: TopicNode[]): Matcher[] {
  let m = cache.get(tax);
  if (!m) {
    m = tax.flatMap((node) =>
      termsOf(node).map((t) => ({ node, re: new RegExp(`(?<![a-z0-9])${t.split(' ').map(escape).join('[^a-z0-9]+')}(?:s|es)?(?![a-z0-9])`, 'g') })),
    );
    cache.set(tax, m);
  }
  return m;
}

// Is this match something the reader wants less of? Look back up to 3 words in its clause.
function isNegated(text: string, start: number): boolean {
  const before = text.slice(0, start);
  const clause = before.slice(Math.max(before.lastIndexOf('.'), before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(':'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('\n')) + 1);
  const words = clause.split(/[^a-z0-9]+/).filter(Boolean).reverse();
  for (const w of words.slice(0, WINDOW)) {
    if (RESETS.has(w)) return false;
    if (NEGATORS.has(w)) return true;
  }
  return false;
}

export function keywordTopics(text: string, tax: TopicNode[]): { picks: TopicSlug[]; blocked: TopicSlug[] } {
  const t = normalize(text);
  if (!t.trim()) return { picks: [], blocked: [] };

  const hits: Hit[] = [];
  for (const { node, re } of matchersFor(tax)) {
    re.lastIndex = 0;
    for (let m = re.exec(t); m; m = re.exec(t)) hits.push({ start: m.index, end: m.index + m[0].length, node });
  }

  // Longest span first, then the deepest topic; an overlapping shorter span is dropped, and on the
  // very same span only the deepest level is kept ("culture": Culture & Heritage, not Arts & Culture).
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || b.node.level - a.node.level || a.start - b.start);
  const kept: Hit[] = [];
  for (const h of hits) {
    const clash = kept.find((k) => h.start < k.end && k.start < h.end);
    if (!clash) kept.push(h);
    else if (clash.start === h.start && clash.end === h.end && clash.node.level === h.node.level && clash.node.slug !== h.node.slug) kept.push(h);
  }

  const want = new Map<TopicSlug, { level: number; at: number }>();
  const avoid = new Map<TopicSlug, { level: number; at: number }>();
  for (const h of kept.sort((a, b) => a.start - b.start)) {
    const target = isNegated(t, h.start) ? avoid : want;
    if (!target.has(h.node.slug)) target.set(h.node.slug, { level: h.node.level, at: h.start });
  }
  for (const slug of avoid.keys()) want.delete(slug);

  const ranked = (m: Map<TopicSlug, { level: number; at: number }>) =>
    [...m.entries()].sort(([, a], [, b]) => b.level - a.level || a.at - b.at).slice(0, MAX).map(([slug]) => slug);
  return { picks: ranked(want), blocked: ranked(avoid) };
}
