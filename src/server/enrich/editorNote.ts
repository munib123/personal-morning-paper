// The editor's note (ARCHITECTURE §9.3, §9.7, §10.5), in the Morrow voice (§3a): Gemini when the note
// passes deterministic checks, the §9.7 template otherwise. Demo personas (preferSmart) get
// SMART → FAST → FALLBACK → template; everyone else FAST → FALLBACK → template. Never throws.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { WeightDelta } from '@/contracts/signals';
import { callLLM } from '@/server/ai';
import { numbersFaithful, wordCount } from './guardrails';
import type { EditorNoteInput } from './index';
import { noteVoiceOk } from './voice';

const NOTE_TIMEOUT_MS = 20_000;
const MIN_WORDS = 54; // 60–90 words, ±10%
const MAX_WORDS = 99;

const noteSchema = z.object({ note: z.string() });

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

const firstName = (input: EditorNoteInput) => input.displayName?.trim().split(/\s+/)[0] ?? '';

/** The §9.7 template. It already reads in the Morrow voice: calm, "you", no "I", no exclamation marks. */
export function templateNote(input: EditorNoteInput): string {
  const name = firstName(input);
  const greeting = name ? `Good morning, ${name}.` : 'Good morning.';
  const k = input.headlines.length;
  const lead = input.headlines[0]?.headline;
  const edition = lead ? `Edition No. ${input.number}: ${k} ${k === 1 ? 'story' : 'stories'}, led by "${lead}".` : `Edition No. ${input.number}.`;
  return [greeting, edition, moversSentence(input.movers)].filter(Boolean).join(' ');
}

/** Strings the note may quote verbatim, so they never trip the voice check (a headline like "Why I quit PSX!"). */
export function inputStrings(input: EditorNoteInput): string[] {
  return [...input.headlines.map((h) => h.headline), ...input.movers.map((m) => m.name), input.paperName, input.displayName ?? '', firstName(input)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first, so a headline is removed before any name inside it
}

function instructions(paperName: string): string {
  return [
    `Write the editor's note that opens the reader's personal morning paper, ${paperName}.`,
    'Write 60–90 words, calm, short and concrete, like a good newspaper editor.',
    'Speak to the reader as "you" and call the paper "your paper". Never write "I", "we" or "our AI".',
    'No exclamation marks, no emoji, no flattery.',
    'Mention 2–3 of the given headlines by name.',
    'If movers are given, say in one sentence what your paper is showing more or less of, in the reader\'s terms ' +
      '(for example "More cricket, because you read it this week").',
    'Use only facts in the input.',
    'Return {"note": "..."}.',
  ].join(' ');
}

function passes(note: string, input: EditorNoteInput): boolean {
  const n = wordCount(note);
  return n >= MIN_WORDS && n <= MAX_WORDS && numbersFaithful([note], JSON.stringify(input)) && noteVoiceOk(note, inputStrings(input));
}

export async function writeEditorNote(input: EditorNoteInput): Promise<{ text: string; source: 'gemini' | 'template' }> {
  const template = templateNote(input);
  try {
    const result = await callLLM('editor_note', { instructions: instructions(input.paperName), prompt: JSON.stringify(input) }, noteSchema, {
      model: input.preferSmart ? 'smart' : 'fast',
      timeoutMs: NOTE_TIMEOUT_MS,
      cacheKey: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      fallback: () => ({ note: template }),
    });
    const note = result.output.note.trim();
    if (result.provider === 'gemini' && passes(note, input)) return { text: note, source: 'gemini' };
  } catch (err) {
    console.warn(`[enrich] editor note fell back to the template: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { text: template, source: 'template' };
}
