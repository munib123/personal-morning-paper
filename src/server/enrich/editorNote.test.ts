// writeEditorNote with a stubbed callLLM (no model, no network).
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@/lib/brand';
import type { EditorNoteInput } from './index';
import { noteVoiceOk } from './voice';

const callLLM = vi.fn();
vi.mock('@/server/ai', () => ({ callLLM: (...args: unknown[]) => callLLM(...args) }));

const { inputStrings, templateNote, writeEditorNote } = await import('./editorNote');

const headlines = [
  { headline: 'PSX hits record high', section: 'business' },
  ...Array.from({ length: 19 }, (_, i) => ({ headline: `Story ${i + 2}`, section: 'news' })),
];
const movers = [
  { slug: 'sports.cricket', name: 'Cricket', before: 0.4, after: 0.6 },
  { slug: 'technical.cs.ai-ml', name: 'AI & Machine Learning', before: 0.5, after: 0.6 },
  { slug: 'entertainment.pakistani-showbiz', name: 'Pakistani Showbiz', before: 0.5, after: 0.3 },
];
const input: EditorNoteInput = { paperName: BRAND.defaultPaperName(), displayName: 'Ayesha Khan', date: '2026-10-17', number: 3, headlines, movers, streak: 6 };

const TEMPLATE =
  'Good morning, Ayesha. Edition No. 3: 20 stories, led by "PSX hits record high". More Cricket and AI & Machine Learning, less Pakistani Showbiz, based on what you read.';

/** A 72-word note in the Morrow voice with no numbers. */
const NOTE_72 = [
  'Good morning, Ayesha. Your paper leads with PSX hits record high, a strong day for the market you follow.',
  'Further in, Story 2 and Story 3 cover the week in depth.',
  'Your paper is showing more cricket and more AI this morning, because you read those stories to the end,',
  'and a little less Pakistani showbiz. Take the long read with your tea and skim the briefs when you have a minute.',
].join(' ');

const gemini = (note: string) => callLLM.mockResolvedValue({ output: { note }, provider: 'gemini', model: 'fast-test', cached: false });
const words = (s: string) => s.trim().split(/\s+/).length;

beforeEach(() => {
  callLLM.mockReset();
});

describe('templateNote', () => {
  it('follows §9.7', () => {
    expect(templateNote(input)).toBe(TEMPLATE);
    expect(templateNote({ ...input, displayName: null, number: 1, movers: [] })).toBe('Good morning. Edition No. 1: 20 stories, led by "PSX hits record high".');
    expect(templateNote({ ...input, movers: movers.slice(0, 1) })).toContain('More Cricket, based on what you read.');
    expect(templateNote({ ...input, movers: movers.slice(2) })).toContain('Less Pakistani Showbiz, based on what you read.');
  });

  it('templateNote passes the Morrow voice check', () => {
    for (const i of [input, { ...input, displayName: null }, { ...input, movers: [] }]) {
      expect(noteVoiceOk(templateNote(i), inputStrings(i))).toBe(true);
    }
  });
});

describe('writeEditorNote', () => {
  it('uses gemini when the note passes', async () => {
    expect(words(NOTE_72)).toBe(72);
    gemini(NOTE_72);
    await expect(writeEditorNote(input)).resolves.toEqual({ text: NOTE_72, source: 'gemini' });
  });

  it('rejects a note outside 54–99 words', async () => {
    gemini(NOTE_72.split(' ').slice(0, 50).join(' '));
    await expect(writeEditorNote(input)).resolves.toEqual({ text: TEMPLATE, source: 'template' });
    gemini(`${NOTE_72} ${NOTE_72}`);
    await expect(writeEditorNote(input)).resolves.toEqual({ text: TEMPLATE, source: 'template' });
  });

  it('rejects a note with a number not in the input', async () => {
    gemini(NOTE_72.replace('a strong day', 'a 47 percent day'));
    await expect(writeEditorNote(input)).resolves.toMatchObject({ source: 'template' });
    gemini(NOTE_72.replace('a strong day', 'edition 3, a strong day'));
    await expect(writeEditorNote(input)).resolves.toMatchObject({ source: 'gemini' });
  });

  it('writeEditorNote rejects a note that breaks the Morrow voice', async () => {
    const broken = [
      NOTE_72.replace('Take the long read', 'I suggest the long read'),
      NOTE_72.replace('the market you follow.', 'the market you follow!'),
      NOTE_72.replace('with your tea', 'with your tea ☀️'),
      NOTE_72.replace('because you read', 'because our AI saw you read'),
    ];
    for (const note of broken) {
      gemini(note);
      await expect(writeEditorNote(input), note).resolves.toEqual({ text: templateNote(input), source: 'template' });
    }
    const quoting = { ...input, headlines: [{ headline: 'Why I quit PSX!', section: 'business' }, ...headlines.slice(1)] };
    gemini(NOTE_72.replace('PSX hits record high, a strong day for the market you follow.', '"Why I quit PSX!", a strong read for the market you follow.'));
    await expect(writeEditorNote(quoting)).resolves.toMatchObject({ source: 'gemini' });
  });

  it("writeEditorNote calls callLLM with model 'fast' and the input's sha256 as cache key", async () => {
    gemini(NOTE_72);
    await writeEditorNote(input);
    await writeEditorNote({ ...input, preferSmart: false });
    for (const [n, i] of [input, { ...input, preferSmart: false }].entries()) {
      const [step, prompt, , opts] = callLLM.mock.calls[n];
      expect(step).toBe('editor_note');
      expect(opts).toMatchObject({ model: 'fast', timeoutMs: 20_000, cacheKey: createHash('sha256').update(JSON.stringify(i)).digest('hex') });
      expect(prompt.instructions).toContain('The Morrow');
      expect(prompt.instructions).toContain('your paper');
      expect(JSON.parse(prompt.prompt)).toEqual(JSON.parse(JSON.stringify(i)));
      expect(opts.fallback()).toEqual({ note: templateNote(i) });
    }
  });

  it('writeEditorNote prefers smart for demo personas', async () => {
    gemini(NOTE_72);
    await writeEditorNote({ ...input, preferSmart: true });
    expect(callLLM.mock.calls[0][3]).toMatchObject({ model: 'smart' });
  });

  it('returns the template when callLLM falls back', async () => {
    callLLM.mockImplementation(async (_s: string, _i: unknown, _schema: unknown, opts: { fallback: () => { note: string } }) => ({
      output: opts.fallback(),
      provider: 'fallback',
      model: null,
      cached: false,
    }));
    await expect(writeEditorNote(input)).resolves.toEqual({ text: TEMPLATE, source: 'template' });
  });
});
