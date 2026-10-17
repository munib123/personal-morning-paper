import { describe, expect, it } from 'vitest';
import { headlineVoiceOk, noteVoiceOk } from './voice';

describe('headlineVoiceOk (Morrow: no questions, no exclamation marks, no emoji)', () => {
  it('rejects ! ? and emoji', () => {
    expect(headlineVoiceOk('PSX hits record high!')).toBe(false);
    expect(headlineVoiceOk('Will PSX hit a record?')).toBe(false);
    expect(headlineVoiceOk('PSX hits record high 📈')).toBe(false);
  });

  it('accepts a headline that states what happened', () => {
    expect(headlineVoiceOk('PSX closes at a record 98,400')).toBe(true);
    expect(headlineVoiceOk('Central bank holds rates for a third month')).toBe(true);
  });
});

describe('noteVoiceOk (Morrow: "you", never "I", "we" or "our AI")', () => {
  it('rejects I, exclamation marks and emoji', () => {
    expect(noteVoiceOk('I picked these for you.', [])).toBe(false);
    expect(noteVoiceOk("Here is what I've found for you.", [])).toBe(false);
    expect(noteVoiceOk('Big day!', [])).toBe(false);
    expect(noteVoiceOk('Good morning ☀️ Your paper leads with markets.', [])).toBe(false);
  });

  it('rejects we and our AI', () => {
    expect(noteVoiceOk('We picked five stories for you.', [])).toBe(false);
    expect(noteVoiceOk("Today we're leading with markets.", [])).toBe(false);
    expect(noteVoiceOk('Our AI chose these stories.', [])).toBe(false);
  });

  it('ignores the input strings, so a quoted headline never trips the check', () => {
    expect(noteVoiceOk('Your paper leads with "Why I quit PSX!"', ['Why I quit PSX!'])).toBe(true);
    expect(noteVoiceOk('Your paper leads with "Why I quit PSX!"', [])).toBe(false);
  });

  it('does not see an I inside AI or a we inside Wednesday', () => {
    expect(noteVoiceOk('AI & Machine Learning', [])).toBe(true);
    expect(noteVoiceOk('On Wednesday your paper covers AI policy.', [])).toBe(true);
  });
});
