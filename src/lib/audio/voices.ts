// Voice selection for SpeechSynthesis (pure). The browser's voice list differs per OS, so we rank
// what is there: the reader's stored choice, then a natural-sounding English voice, then the default.

/** The part of SpeechSynthesisVoice we read (so tests and node can fake it). */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
}

export interface PickVoiceOptions {
  /** 'ur' for Urdu text; anything else means English. */
  lang: string;
  /** The voice name stored from a previous session; ignored for Urdu. */
  preferredName?: string | null;
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

export function hasUrduScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

const NATURAL = /natural|neural|premium|enhanced|google|siri|samantha|daniel|moira|karen|aria|jenny|sonia|libby/i;

function langScore(voice: VoiceLike, prefix: string): number {
  const l = voice.lang.toLowerCase().replace('_', '-');
  if (l === `${prefix}-gb` || l === `${prefix}-us` || l === `${prefix}-pk`) return 3;
  if (l.startsWith(`${prefix}-`) || l === prefix) return 2;
  return 0;
}

function rank(voice: VoiceLike, prefix: string): number {
  const lang = langScore(voice, prefix);
  if (lang === 0) return 0;
  return lang * 10 + (NATURAL.test(voice.name) ? 5 : 0) + (voice.default ? 2 : 0) + (voice.localService === false ? 1 : 0);
}

function best(voices: VoiceLike[], prefix: string): VoiceLike | null {
  let top: VoiceLike | null = null;
  let topScore = 0;
  for (const voice of voices) {
    const score = rank(voice, prefix);
    if (score > topScore) {
      top = voice;
      topScore = score;
    }
  }
  return top;
}

/**
 * The voice to speak with: the stored preference if it still exists (English only), else the best
 * voice for the language (Urdu falls back to Hindi, then English), else the default, else the first.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], opts: PickVoiceOptions): V | null {
  if (voices.length === 0) return null;
  const list = voices as readonly VoiceLike[];
  const urdu = opts.lang.toLowerCase().startsWith('ur');
  if (!urdu && opts.preferredName) {
    const stored = list.find((v) => v.name === opts.preferredName);
    if (stored) return stored as V;
  }
  const chain = urdu ? ['ur', 'hi', 'en'] : [opts.lang.toLowerCase().split('-')[0], 'en'];
  for (const prefix of chain) {
    const found = best(list, prefix);
    if (found) return found as V;
  }
  return (list.find((v) => v.default) ?? list[0]) as V;
}
