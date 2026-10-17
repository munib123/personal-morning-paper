// STUB (L0) — owner: L2. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { TopicSlug } from '@/contracts/taxonomy';
import type { WeightDelta } from '@/contracts/signals';

export interface EnrichStats { enriched: number; fallback: number; unusable: number; llmCalls: number; ms: number; }

// Zeroed stats; writes nothing and makes no LLM calls.
export async function runEnrich(opts?: { limit?: number; batchSize?: number }): Promise<EnrichStats> {
  return { enriched: 0, fallback: 0, unusable: 0, llmCalls: 0, ms: 0 };
}

export interface EditorNoteInput { paperName: string; displayName: string | null; date: string; number: number; headlines: { headline: string; section: string }[]; movers: WeightDelta[]; streak: number;
  preferSmart?: boolean; }   // true for demo personas (profile.is_demo) → SMART model; everyone else uses the FAST ladder

// "More {A} and {B}, less {C}, based on what you read." Up = top 2 risers, down = top 1 faller; '' when nothing moved.
function moversSentence(movers: WeightDelta[]): string {
  const delta = (m: WeightDelta) => m.after - m.before;
  const up = movers.filter((m) => delta(m) > 0).sort((a, b) => delta(b) - delta(a)).slice(0, 2).map((m) => m.name);
  const down = movers.filter((m) => delta(m) < 0).sort((a, b) => delta(a) - delta(b)).slice(0, 1).map((m) => m.name);
  if (up.length > 0 && down.length > 0) return `More ${up.join(' and ')}, less ${down[0]}, based on what you read.`;
  if (up.length > 0) return `More ${up.join(' and ')}, based on what you read.`;
  if (down.length > 0) return `Less ${down[0]}, based on what you read.`;
  return '';
}

// The §9.7 editor-note template.
function templateNote(input: EditorNoteInput): string {
  const firstName = input.displayName?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `Good morning, ${firstName}.` : 'Good morning.';
  const k = input.headlines.length;
  const lead = input.headlines[0]?.headline;
  const edition = lead
    ? `Edition No. ${input.number}: ${k} ${k === 1 ? 'story' : 'stories'}, led by "${lead}".`
    : `Edition No. ${input.number}.`;
  return [greeting, edition, moversSentence(input.movers)].filter(Boolean).join(' ');
}

// Always the deterministic template (no Gemini call); preferSmart is ignored by the stub.
export async function writeEditorNote(input: EditorNoteInput): Promise<{ text: string; source: 'gemini' | 'template' }> {
  return { text: templateNote(input), source: 'template' };
}

export async function mapTextToTopics(text: string): Promise<{ picks: TopicSlug[]; blocked: TopicSlug[]; provider: 'gemini' | 'keyword' }> {
  return { picks: [], blocked: [], provider: 'keyword' };
}
