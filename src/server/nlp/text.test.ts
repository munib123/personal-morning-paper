import { describe, expect, it } from 'vitest';
import { embeddingInput, splitSentences } from './text';

describe('splitSentences', () => {
  it('does not split "Dr. Khan said. Next one." into 3', () => {
    expect(splitSentences('Dr. Khan said. Next one.')).toEqual(['Dr. Khan said.', 'Next one.']);
  });

  it('splits on ! and ? and before digits and quotes', () => {
    expect(splitSentences('It rained! Did it stop? 2026 was dry. "Yes," she said.')).toEqual([
      'It rained!',
      'Did it stop?',
      '2026 was dry.',
      '"Yes," she said.',
    ]);
  });

  it('keeps abbreviations such as Mr. and vs. inside the sentence', () => {
    expect(splitSentences('Mr. Ali met Ms. Sana. Pakistan vs. India is on Sunday.')).toEqual([
      'Mr. Ali met Ms. Sana.',
      'Pakistan vs. India is on Sunday.',
    ]);
  });

  it('does not split before a lowercase word and drops empty input', () => {
    expect(splitSentences('The U.S. economy grew 2.1 percent. Prices rose.')).toEqual(['The U.S. economy grew 2.1 percent.', 'Prices rose.']);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('splits after a closing quote or bracket', () => {
    expect(splitSentences('He said "prices will settle." Markets rose. (It was Friday.) Then it rained.')).toEqual([
      'He said "prices will settle."',
      'Markets rose.',
      '(It was Friday.)',
      'Then it rained.',
    ]);
  });

  it('returns unpunctuated text as one sentence', () => {
    expect(splitSentences('  A title without a full stop  ')).toEqual(['A title without a full stop']);
  });
});

describe('embeddingInput', () => {
  it('joins title + ". " + first 2 sentences of lede', () => {
    const input = embeddingInput({
      title: 'PSX closes at a record',
      lede: 'The KSE-100 gained 1,250 points. Volumes rose. Analysts expect more.',
      contentText: 'Ignored because the lede exists.',
    });
    expect(input).toBe('PSX closes at a record. The KSE-100 gained 1,250 points. Volumes rose.');
  });

  it('uses the content text when there is no lede', () => {
    expect(embeddingInput({ title: 'T', lede: null, contentText: 'One. Two. Three.' })).toBe('T. One. Two.');
    expect(embeddingInput({ title: 'T', lede: '  ', contentText: 'One. Two. Three.' })).toBe('T. One. Two.');
  });

  it('uses title alone', () => {
    expect(embeddingInput({ title: 'Show HN: a tiny database', lede: null, contentText: null })).toBe('Show HN: a tiny database');
  });
});
