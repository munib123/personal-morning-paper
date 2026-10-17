// "Tell your editor" (W2), the pure half: the reader's words + the topics mapTextToTopics found → a
// proposed diff on their interests. PURE: no I/O, no clock, no model calls.
//
// One sentence: the verb in front of each topic decides the change (more → up, less → down, always →
// pin, never → mute), and mapTextToTopics decides which topics there are.
//
// Topics come only from `picks` (the mapper's output); the text is searched for those topics' own
// names and synonyms just to find which verb governs each one, never to discover new topics. A topic
// the text does not name (Gemini mapped "the stars" to Space & Astronomy) takes the first clause whose
// direction fits it: a pick the first "more", a blocked topic the first "less" or "never".
import type { mapTextToTopics } from '@/server/enrich';
import type { InterestWeight } from '@/contracts/profile';
import type { TopicNode, TopicSlug } from '@/contracts/taxonomy';
import { DEFAULT_PARAMS } from '@/server/rank/params';

export type EditorAction = 'raise' | 'lower' | 'pin' | 'mute' | 'add';

export interface EditorChange {
  slug: TopicSlug;
  name: string;
  before: number; // blended θ̂ now, in [0, 1]
  after: number; // θ̂ the paper will use: the reachable target for raise/add/lower, unchanged for pin, 0 for mute
  action: EditorAction;
  reason: string; // one line quoting the reader
}

export interface EditorProposal {
  changes: EditorChange[];
  unmatched: string[]; // the reader's words that named no topic
}

type Mapped = Awaited<ReturnType<typeof mapTextToTopics>>;

export interface ProposeInput {
  text: string;
  picks: Pick<Mapped, 'picks' | 'blocked'>;
  interests: InterestWeight[];
  topics?: TopicNode[]; // names and synonyms for finding where the reader named a topic
}

export const MAX_CHANGES = 6;
export const STEP = 0.15; // "more" / "less" move a topic 15 points
export const ADD_WEIGHT = 0.5; // a new topic joins at a middle weight
const MAX_UNMATCHED = 3;
const MAX_QUOTE = 60;
const UNPICKED_MEAN = (() => {
  const [a, b] = DEFAULT_PARAMS.priors.unpicked;
  return a / (a + b);
})();

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

// ── The own weight behind a blended θ̂ ────────────────────────────────────────────────────────
// θ̂ = (0.6·own + 0.3·parent + 0.1·grandparent) / Σ weights of the levels that exist, so moving θ̂ by
// d moves the own mean by d·k, with k = Σ / 0.6 (1 for a root, 1.5 for level 2, 1.67 for level 3).
const kFor = (level: number) => {
  const ws = DEFAULT_PARAMS.blend.slice(0, Math.max(1, Math.min(3, level)));
  return ws.reduce((a, b) => a + b, 0) / ws[0];
};

/** The value to send to editInterest 'set' (own mean) so the blended θ̂ lands on `target`, and the θ̂ it reaches. */
export function setValueFor(w: { theta: number; alpha: number; beta: number; level: number }, target: number): { value: number; after: number } {
  const theta = clamp01(w.theta);
  const mass = w.alpha + w.beta;
  const own = mass > 0 ? clamp01(w.alpha / mass) : UNPICKED_MEAN;
  const k = kFor(w.level);
  const value = clamp01(own + (clamp01(target) - theta) * k);
  return { value: r4(value), after: r4(clamp01(theta + (value - own) / k)) };
}

// ── Cues: the reader's verbs ─────────────────────────────────────────────────────────────────
type Direction = 'raise' | 'lower' | 'pin' | 'mute';

const CUES: Record<Direction, string[]> = {
  raise: [
    'more', 'more of', 'more on', 'more about', 'love', 'like', 'enjoy', 'interested in', 'curious about', 'curious',
    'keen on', 'into', 'want', 'give me', 'add', 'follow', 'fan of', 'big on', 'show me', 'tell me about',
    'learn about', 'obsessed with', 'passionate about', 'excited about', 'explore', 'lots of', 'plenty of', 'not only',
  ],
  lower: [
    'less', 'less of', 'fewer', 'stop', 'stop showing', 'no more', 'any more', 'anymore', 'not so much', 'not as much',
    'not much', 'not', 'no longer', "don't like", 'do not like', "don't care about", 'dislike', 'tired of', 'bored of', 'bored with',
    'enough', 'enough of', 'cut down on', 'cut back on', 'reduce', 'tone down', 'dial down', 'not interested in',
    'not into', 'too much', 'too many',
  ],
  pin: ['only', 'always', 'pin', 'never miss', 'every day', 'must have', 'top priority', 'above all'],
  mute: [
    'never', 'hide', 'mute', 'block', 'no', 'nothing on', 'nothing about', "don't show", 'do not show', "don't want",
    'do not want', 'hate', 'remove', 'drop', 'skip', 'get rid of', 'ban',
  ],
};

const CUE_OF = new Map<string, Direction>(
  (Object.entries(CUES) as [Direction, string[]][]).flatMap(([dir, cues]) => cues.map((c) => [c, dir] as const)),
);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (alternatives: string[]) => `(?<![a-z0-9])(?:${alternatives.map(escapeRegex).join('|')})(?![a-z0-9])`;
// Longest first, so "no more" beats "no" and "never miss" beats "never" at the same position.
const CUE_RE = new RegExp(word([...CUE_OF.keys()].sort((a, b) => b.length - a.length)), 'g');
// A cue's reach ends at the next cue, a sentence end, or a turn ("but", "however").
const STOP_RE = /[.;!?\n]|(?<![a-z0-9])(?:but|however|though|although)(?![a-z0-9])/g;
const ITEM_SEP_RE = /,|&|\/|(?<![a-z0-9])(?:and|or|plus|also)(?![a-z0-9])/g;

const FILLER = new Set(
  `a an the some any bit little lot lots of on about in into with for from around to and or but so that this these those
  is are be being been it it's its which i i'm im i'd i've me my myself please really very much too also just would
  see read get more stuff things thing news stories story articles article coverage updates update especially
  mainly mostly maybe perhaps kind sort honestly actually generally general all like there's here other`.split(/\s+/),
);

interface Span { start: number; end: number }
interface Clause { dir: Direction | null; cueStart: number; start: number; end: number; items: Span[] }

function spans(re: RegExp, s: string, from = 0, to = s.length): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  for (const m of s.slice(from, to).matchAll(re)) out.push({ start: from + (m.index ?? 0), end: from + (m.index ?? 0) + m[0].length });
  return out;
}

/** Trim filler words off both ends of [start, end); null when nothing meaningful is left. */
function core(lower: string, start: number, end: number): Span | null {
  const tokens = spans(/[a-z0-9'][a-z0-9'-]*/g, lower, start, end);
  let i = 0;
  let j = tokens.length - 1;
  while (i <= j && FILLER.has(lower.slice(tokens[i].start, tokens[i].end))) i++;
  while (j >= i && FILLER.has(lower.slice(tokens[j].start, tokens[j].end))) j--;
  if (i > j) return null;
  const s = { start: tokens[i].start, end: tokens[j].end };
  return /[a-z]{2,}|[0-9]/.test(lower.slice(s.start, s.end)) ? s : null;
}

const STRENGTH: Record<Direction, number> = { raise: 1, lower: 2, pin: 3, mute: 3 };

/** Split the text into clauses, each governed by one cue (or none, for text no cue reaches). */
function clausesOf(lower: string): Clause[] {
  const cues = spans(CUE_RE, lower);
  const stops = spans(STOP_RE, lower);
  const bounds = [...cues.map((c) => c.start), ...stops.map((s) => s.start), lower.length].sort((a, b) => a - b);
  const nextBound = (after: number) => bounds.find((b) => b >= after) ?? lower.length;
  const out: Clause[] = [];
  const pushClause = (dir: Direction | null, cueStart: number, start: number, end: number) => {
    if (end <= start && dir === null) return;
    const items: Span[] = [];
    let at = start;
    for (const sep of [...spans(ITEM_SEP_RE, lower, start, end), { start: end, end }]) {
      const c = core(lower, at, sep.start);
      if (c) items.push(c);
      at = sep.end;
    }
    out.push({ dir, cueStart, start, end, items });
  };
  // Text before the first cue, and text after a sentence stop that no cue governs, are bare clauses.
  const pushBare = (from: number, to: number) => {
    let s = from;
    for (const stop of stops.filter((x) => x.start >= from && x.start < to)) {
      pushClause(null, s, s, stop.start);
      s = stop.end;
    }
    pushClause(null, s, s, to);
  };
  let at = 0;
  for (const cue of cues) {
    if (cue.start > at) pushBare(at, cue.start);
    const end = nextBound(cue.end);
    pushClause(CUE_OF.get(lower.slice(cue.start, cue.end)) ?? null, cue.start, cue.end, end);
    at = end;
  }
  if (at < lower.length) pushBare(at, lower.length);
  // Chained cues read as one: "only want" pins, "I'd like less" lowers, "don't want any more" mutes.
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    if (a.dir && b.dir && a.items.length === 0 && a.end === b.cueStart) {
      if (STRENGTH[a.dir] >= STRENGTH[b.dir]) b.dir = a.dir;
      b.cueStart = a.cueStart;
    }
  }
  return out;
}

// ── Where the reader named each topic ────────────────────────────────────────────────────────
function termsFor(slug: TopicSlug, name: string, synonyms: string[]): string[] {
  const parts = name.toLowerCase().split(/[&,]/).map((s) => s.trim());
  const last = slug.split('.').pop()!.replace(/-/g, ' ');
  return [...new Set([...parts, ...synonyms.map((s) => s.toLowerCase().trim()), last])].filter((t) => t.length > 1);
}

function firstMention(lower: string, terms: string[]): Span | null {
  let best: Span | null = null;
  for (const t of terms) {
    const m = new RegExp(word([t])).exec(lower);
    if (m && (!best || m.index < best.start)) best = { start: m.index, end: m.index + m[0].length };
  }
  return best;
}

const clip = (s: string) => (s.length > MAX_QUOTE ? `${s.slice(0, MAX_QUOTE - 1).trimEnd()}…` : s);

function reasonFor(action: EditorAction, quote: string): string {
  const q = `"${clip(quote)}"`;
  switch (action) {
    case 'add':
      return `You said ${q}, so it joins your paper.`;
    case 'pin':
      return `You said ${q}, so it will be in every paper.`;
    case 'mute':
      return `You said ${q}, so it leaves your paper.`;
    default:
      return `You said ${q}.`;
  }
}

const actionFor = (dir: Direction, absent: boolean): EditorAction => (dir === 'raise' && absent ? 'add' : dir);

export function proposeChanges({ text, picks, interests, topics = [] }: ProposeInput): EditorProposal {
  const clean = text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const lowered = clean.toLowerCase();
  const orig = lowered.length === clean.length ? clean : lowered; // quotes keep the reader's casing when indices align
  const clauses = clausesOf(lowered);
  const hasCue = clauses.some((c) => c.dir !== null);
  const byWeight = new Map(interests.map((w) => [w.slug, w]));
  const byTopic = new Map(topics.map((t) => [t.slug, t]));

  const blocked = new Set(picks.blocked);
  const slugs = [...new Set([...picks.picks, ...picks.blocked])];
  const used = new Set<Clause>(); // clauses that took a topic the text does not name
  const located: { slug: TopicSlug; at: number; dir: Direction; quote: string }[] = [];
  const hit = new Set<string>(); // "clauseIndex:itemIndex" items that named a topic

  const quoteOf = (c: Clause, item: Span | null) => {
    if (c.dir === null) return item ? orig.slice(item.start, item.end) : orig.slice(c.start, c.end).trim();
    const end = item ? item.end : (c.items.at(-1)?.end ?? c.end);
    return orig.slice(c.cueStart, end).trim();
  };

  for (const slug of slugs) {
    const w = byWeight.get(slug);
    const t = byTopic.get(slug);
    const span = firstMention(lowered, termsFor(slug, t?.name ?? w?.name ?? slug, t?.synonyms ?? []));
    const ci = span ? clauses.findIndex((c) => span.start >= c.start && span.start < Math.max(c.end, c.start + 1)) : -1;
    if (span && ci >= 0) {
      const c = clauses[ci];
      const ii = c.items.findIndex((it) => span.start < it.end && span.end > it.start);
      if (ii >= 0) hit.add(`${ci}:${ii}`);
      const dir: Direction = c.dir ?? (blocked.has(slug) ? 'lower' : 'raise');
      located.push({ slug, at: span.start, dir, quote: quoteOf(c, ii >= 0 ? c.items[ii] : null) });
      continue;
    }
    // Not named in the text: take the first clause whose direction fits what the mapper understood.
    // With verbs in the text but none that fits, the reader's words cannot justify it: leave it out.
    const fits: Direction[] = blocked.has(slug) ? ['lower', 'mute'] : ['raise', 'pin'];
    const c = clauses.find((x) => x.dir === fits[0]) ?? clauses.find((x) => x.dir === fits[1]);
    if (c) {
      used.add(c);
      located.push({ slug, at: c.cueStart, dir: c.dir ?? fits[0], quote: quoteOf(c, null) });
    } else if (!hasCue) {
      located.push({ slug, at: Number.MAX_SAFE_INTEGER, dir: fits[0], quote: clean });
    }
  }

  const changes: EditorChange[] = [];
  for (const m of located.sort((a, b) => a.at - b.at)) {
    if (changes.length >= MAX_CHANGES) break;
    const t = byTopic.get(m.slug);
    const level = byWeight.get(m.slug)?.level ?? t?.level ?? Math.min(3, m.slug.split('.').length);
    const w = byWeight.get(m.slug) ?? {
      slug: m.slug, name: t?.name ?? m.slug, level, theta: UNPICKED_MEAN, alpha: 1, beta: 3, picked: false, muted: false, pinned: false,
    };
    const before = r4(clamp01(w.theta));
    const absent = !byWeight.has(m.slug) || (!w.picked && !w.pinned && before < ADD_WEIGHT);
    const action = actionFor(m.dir, absent);
    let after = before;
    if (action === 'mute') {
      if (w.muted) continue;
      after = 0;
    } else if (action === 'pin') {
      if (w.pinned && !w.muted) continue;
    } else {
      const target = action === 'add' ? Math.max(ADD_WEIGHT, before + STEP) : action === 'raise' ? before + STEP : before - STEP;
      after = setValueFor({ ...w, theta: before }, target).after;
      if (Math.abs(after - before) < 0.005 && !(w.muted && action !== 'lower')) continue;
    }
    changes.push({ slug: m.slug, name: w.name, before, after, action, reason: reasonFor(action, m.quote) });
  }

  const unmatched: string[] = [];
  clauses.forEach((c, ci) => {
    if (used.has(c) || (c.dir === null && hasCue)) return;
    c.items.forEach((it, ii) => {
      if (!hit.has(`${ci}:${ii}`)) unmatched.push(clip(orig.slice(it.start, it.end)));
    });
  });
  return { changes, unmatched: [...new Set(unmatched)].slice(0, MAX_UNMATCHED) };
}
