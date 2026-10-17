import { describe, expect, it } from 'vitest';
import type { WeightDelta } from '@/contracts/signals';
import { firstNameOf, moversSentence, templateNote } from './note';

const d = (name: string, before: number, after: number): WeightDelta => ({ slug: name.toLowerCase(), name, before, after });

describe('templateNote (§9.7)', () => {
  it('note template with name and movers', () => {
    expect(
      templateNote({ firstName: 'Ayesha', number: 3, k: 20, leadHeadline: 'Pakistan win the series', movers: [d('Cricket', 0.5, 0.58), d('Pakistani Showbiz', 0.3, 0.24)] }),
    ).toBe('Good morning, Ayesha. Edition No. 3: 20 stories, led by "Pakistan win the series". More Cricket, less Pakistani Showbiz, based on what you read.');
  });

  it('note: no name, no movers', () => {
    expect(templateNote({ firstName: null, number: 1, k: 20, leadHeadline: 'X', movers: [] })).toBe('Good morning. Edition No. 1: 20 stories, led by "X".');
  });

  it('one story reads "1 story"; no "!" anywhere', () => {
    const t = templateNote({ firstName: 'Ayesha', number: 2, k: 1, leadHeadline: 'Y', movers: [] });
    expect(t).toBe('Good morning, Ayesha. Edition No. 2: 1 story, led by "Y".');
    expect(t).not.toContain('!');
  });

  it('firstNameOf takes the first word of the display name', () => {
    expect(firstNameOf('Ayesha Khan')).toBe('Ayesha');
    expect(firstNameOf('  ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('moversSentence (also the /me change summary)', () => {
  it('two risers and one faller', () => {
    expect(moversSentence([d('Cricket', 0.4, 0.48), d('AI & Machine Learning', 0.5, 0.55), d('Pakistani Showbiz', 0.3, 0.24), d('Tennis', 0.3, 0.33)])).toBe(
      'More Cricket and AI & Machine Learning, less Pakistani Showbiz, based on what you read.',
    );
  });

  it('clauses drop when empty; moves under 0.02 do not count', () => {
    expect(moversSentence([d('Cricket', 0.4, 0.48)])).toBe('More Cricket, based on what you read.');
    expect(moversSentence([d('Pakistani Showbiz', 0.3, 0.24)])).toBe('Less Pakistani Showbiz, based on what you read.');
    expect(moversSentence([d('Cricket', 0.4, 0.41)])).toBe('');
    expect(moversSentence([])).toBe('');
  });
});
