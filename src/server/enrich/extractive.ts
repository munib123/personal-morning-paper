// The extractive fallback (ARCHITECTURE §10.3 item 5): whole sentences from the article itself, so it
// always ends on a sentence boundary. brief = the first sentence; std = whole sentences up to ~60 words;
// deep = up to ~120 words; headline = the title; key_fact = the first sentence; recall = null.
// Never cut mid-sentence and never append "…". Pure, no I/O.
import { splitSentences } from '@/server/nlp/text';
import { wordCount } from './guardrails';

export interface ExtractiveFields {
  headline: string;
  summary_brief: string;
  summary_std: string;
  summary_deep: string;
  why_it_matters: null;
  key_fact: string;
  entities: [];
  recall: null;
}

const SLACK = 1.15;
const ENDS_SENTENCE = /[.!?][)\]"'”’]*$/;

/** The article's sentences, minus a trailing fragment the publisher cut off (when others remain). */
function completeSentences(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length > 1 && !ENDS_SENTENCE.test(sentences[sentences.length - 1])) sentences.pop();
  return sentences;
}

function firstSentencesWithin(sentences: string[], budget: number): string {
  if (sentences.length === 0) return '';
  const limit = budget * SLACK;
  const out = [sentences[0]];
  let total = wordCount(sentences[0]);
  for (let i = 1; i < sentences.length; i++) {
    const n = wordCount(sentences[i]);
    if (total + n > limit) break;
    out.push(sentences[i]);
    total += n;
  }
  return out.join(' ');
}

/** Whole sentences while the total stays ≤ budget × 1.15; always at least the first one, never truncated. */
export function wholeSentences(text: string, budget: number): string {
  return firstSentencesWithin(completeSentences(text), budget);
}

export function extractiveEnrichment(a: { title: string; lede: string | null; contentText: string | null }): ExtractiveFields {
  const title = a.title.trim();
  const lede = a.lede?.trim() ?? '';
  const content = a.contentText?.trim() ?? '';
  const sentences = completeSentences(wordCount(content) > wordCount(lede) ? content : lede);
  const first = sentences[0] ?? title; // title-only articles (e.g. HN items) use the title for every tier
  return {
    headline: title,
    summary_brief: first,
    summary_std: sentences.length ? firstSentencesWithin(sentences, 60) : title,
    summary_deep: sentences.length ? firstSentencesWithin(sentences, 120) : title,
    why_it_matters: null,
    key_fact: first,
    entities: [],
    recall: null,
  };
}

/** The articles row patch for an extractive fallback; the caller adds `enriched_at`. */
export function extractiveUpdate(a: { title: string; lede: string | null; contentText: string | null }): ExtractiveFields & {
  status: 'fallback';
  enrich_provider: 'extractive';
} {
  return { ...extractiveEnrichment(a), status: 'fallback', enrich_provider: 'extractive' };
}
