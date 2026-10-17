// Deterministic guardrails for Gemini's enrichment (ARCHITECTURE §10.3): numbers must come from the
// source, word counts stay within ±30% of target, the headline is at most 14 words and in the Morrow
// voice, entities must be in the source (others are dropped), and the recall MCQ has 3 distinct options
// whose correct answer is grounded in summary_std. Pure, no I/O.
import type { EnrichmentItem } from './schema';
import { headlineVoiceOk } from './voice';

export type GuardrailFailure =
  | 'numbers'
  | 'headline_length'
  | 'headline_voice'
  | 'brief_length'
  | 'std_length'
  | 'deep_length'
  | 'why_length'
  | 'recall_shape'
  | 'recall_options'
  | 'recall_grounding';

const band = (target: number): [number, number] => [Math.ceil(0.7 * target), Math.floor(1.3 * target)];
export const HEADLINE_MAX_WORDS = 14;
export const BRIEF_WORDS = band(25); // [18, 32]
export const STD_WORDS = band(60); // [42, 78]
export const DEEP_WORDS = band(125); // [88, 162]
export const WHY_MAX_WORDS = Math.floor(1.3 * 25); // 32
const MAX_ENTITIES = 8;
const MAX_SLUGS = 3;

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const dropThousands = (s: string) => s.replace(/(\d),(?=\d)/g, '$1');
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `n` (thousands separators already removed) appears in the haystack as a whole number: not inside a
 * longer one ("25" in "1250") and not as part of a decimal ("1" in "2.1").
 */
export function numberAppears(n: string, haystack: string): boolean {
  return new RegExp(`(?<!\\d)(?<!\\d[.,])${escapeRegex(n)}(?!\\d)(?![.,]\\d)`).test(haystack);
}

/** Every number in `texts` appears in `source`, ignoring thousands separators. */
export function numbersFaithful(texts: string[], source: string): boolean {
  const haystack = dropThousands(source);
  return texts.every((t) => (t.match(NUMBER) ?? []).every((raw) => numberAppears(dropThousands(raw), haystack)));
}

const STOPWORDS = new Set(
  ('the and for with that this from are was were has have had its his her their them they our your you not but all any can ' +
    'will would should could may might must into onto over under than then there these those who whom what when where which why ' +
    'how about after before more most less also been being did does done per out off upon very just only such some each both ' +
    'other again against because while during between through she him too yet nor own same few').split(' '),
);
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const keyTokens = (s: string) => [...new Set(tokens(s).filter((t) => (t.length >= 3 || /^\d+$/.test(t)) && !STOPWORDS.has(t)))];

/** At least half (rounded up, min 1) of the answer's key tokens appear in the text. */
function grounded(answer: string, text: string): boolean {
  const key = keyTokens(answer);
  const have = new Set(tokens(text));
  const hits = key.filter((t) => have.has(t)).length;
  return hits >= Math.max(1, Math.ceil(key.length / 2));
}

function cleanEntities(entities: string[], source: { title: string; text: string }): string[] {
  const haystack = `${source.title}\n${source.text}`.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entities) {
    const e = raw.trim();
    const key = e.toLowerCase();
    if (!e || seen.has(key) || !haystack.includes(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length === MAX_ENTITIES) break;
  }
  return out;
}

function cleanSlugs(slugs: string[], valid: ReadonlySet<string>): string[] {
  return [...new Set(slugs.map((s) => s.trim()).filter((s) => valid.has(s)))].slice(0, MAX_SLUGS);
}

const inBand = (s: string, [lo, hi]: [number, number]) => {
  const n = wordCount(s);
  return n >= lo && n <= hi;
};

export function checkEnrichment(
  item: EnrichmentItem,
  source: { title: string; text: string },
  validSlugs: ReadonlySet<string>,
): { ok: boolean; failures: GuardrailFailure[]; cleaned: EnrichmentItem } {
  const cleaned: EnrichmentItem = { ...item, entities: cleanEntities(item.entities, source), topic_slugs: cleanSlugs(item.topic_slugs, validSlugs) };
  // An article Gemini calls unusable is only checked for shape (the zod schema, already enforced).
  if (!item.usable) return { ok: true, failures: [], cleaned };

  const failures: GuardrailFailure[] = [];
  const texts = [item.headline, item.summary_brief, item.summary_std, item.summary_deep, item.why_it_matters, item.key_fact];
  if (!numbersFaithful(texts, `${source.title}\n${source.text}`)) failures.push('numbers');

  const headlineWords = wordCount(item.headline);
  if (headlineWords === 0 || headlineWords > HEADLINE_MAX_WORDS) failures.push('headline_length');
  if (!headlineVoiceOk(item.headline)) failures.push('headline_voice');
  if (!inBand(item.summary_brief, BRIEF_WORDS)) failures.push('brief_length');
  if (!inBand(item.summary_std, STD_WORDS)) failures.push('std_length');
  if (!inBand(item.summary_deep, DEEP_WORDS)) failures.push('deep_length');
  if (wordCount(item.why_it_matters) > WHY_MAX_WORDS) failures.push('why_length');

  const { question, options, answer_index: answer } = item.recall;
  const shapeOk = options.length === 3 && Number.isInteger(answer) && answer >= 0 && answer <= 2 && question.trim().length > 0;
  if (!shapeOk) {
    failures.push('recall_shape');
  } else {
    const distinct = new Set(options.map((o) => o.trim().toLowerCase()));
    if (distinct.size !== 3 || distinct.has('')) failures.push('recall_options');
    if (!grounded(options[answer], item.summary_std)) failures.push('recall_grounding');
  }

  return { ok: failures.length === 0, failures, cleaned };
}
