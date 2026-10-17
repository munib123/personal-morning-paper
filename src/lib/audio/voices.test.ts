import { describe, expect, it } from 'vitest';
import { hasUrduScript, pickVoice, type VoiceLike } from './voices';

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name, lang, default: false, localService: true, ...extra });

const VOICES: VoiceLike[] = [
  v('Microsoft Zira - English (United States)', 'en-US', { default: true }),
  v('Google UK English Female', 'en-GB', { localService: false }),
  v('Microsoft Hazel - English (Great Britain)', 'en-GB'),
  v('Google Deutsch', 'de-DE', { localService: false }),
  v('Microsoft Asad - Urdu (Pakistan)', 'ur-PK'),
  v('Google हिन्दी', 'hi-IN', { localService: false }),
];

describe('hasUrduScript', () => {
  it('detects Arabic-script text and ignores Latin', () => {
    expect(hasUrduScript('سرخی یہاں ہے')).toBe(true);
    expect(hasUrduScript('Headline here')).toBe(false);
    expect(hasUrduScript('Mixed: کراچی and Lahore')).toBe(true);
  });
});

describe('pickVoice', () => {
  it('returns null when there are no voices', () => {
    expect(pickVoice([], { lang: 'en' })).toBeNull();
  });

  it('honours the stored preferred voice when it still exists', () => {
    expect(pickVoice(VOICES, { lang: 'en', preferredName: 'Microsoft Hazel - English (Great Britain)' })?.name).toBe('Microsoft Hazel - English (Great Britain)');
  });

  it('prefers an English voice, and among those a natural or Google one over the plain default', () => {
    expect(pickVoice(VOICES, { lang: 'en' })?.name).toBe('Google UK English Female');
    expect(pickVoice([VOICES[0], VOICES[3]], { lang: 'en' })?.name).toBe(VOICES[0].name);
  });

  it('falls back to the default voice, then the first one, when nothing matches the language', () => {
    expect(pickVoice([VOICES[3], VOICES[0]], { lang: 'fr' })?.name).toBe(VOICES[0].name);
    expect(pickVoice([VOICES[3], VOICES[5]], { lang: 'fr' })?.name).toBe(VOICES[3].name);
  });

  it('picks an Urdu voice for Urdu text, else Hindi, else the English choice', () => {
    expect(pickVoice(VOICES, { lang: 'ur' })?.name).toBe('Microsoft Asad - Urdu (Pakistan)');
    expect(pickVoice(VOICES.filter((x) => !x.lang.startsWith('ur')), { lang: 'ur' })?.name).toBe('Google हिन्दी');
    expect(pickVoice(VOICES.slice(0, 4), { lang: 'ur' })?.name).toBe('Google UK English Female');
  });

  it('ignores a preferred voice for Urdu text', () => {
    expect(pickVoice(VOICES, { lang: 'ur', preferredName: 'Google UK English Female' })?.name).toBe('Microsoft Asad - Urdu (Pakistan)');
  });
});
