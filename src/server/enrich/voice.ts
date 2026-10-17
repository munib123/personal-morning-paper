// The Morrow voice (ARCHITECTURE §3a, design README "Voice and copy"), checked in code rather than
// hoped for in the prompt. Headlines state what happened: no questions, no exclamation marks, no emoji.
// The editor's note speaks to "you": never "I", "we" or "our AI", no exclamation marks, no emoji.

export const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

export function headlineVoiceOk(h: string): boolean {
  return !/[!?]/.test(h) && !EMOJI.test(h);
}

/**
 * `ignore` holds the input strings the note may quote verbatim (headlines, mover names, paper name,
 * reader name); they are removed before the check, so a quoted "Why I quit PSX!" never trips it.
 */
export function noteVoiceOk(note: string, ignore: string[]): boolean {
  let rest = note;
  for (const s of ignore) if (s) rest = rest.split(s).join(' ');
  if (rest.includes('!') || EMOJI.test(rest)) return false;
  if (/\bI\b/.test(rest)) return false; // also catches I'm, I've, I'll
  if (/\b(we|we're|we've|our ai)\b/i.test(rest)) return false;
  return true;
}
