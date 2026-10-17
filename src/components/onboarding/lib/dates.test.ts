import { describe, expect, test } from 'vitest';
import { longDate } from './dates';

describe('longDate', () => {
  test('writes the paper date in full', () => {
    expect(longDate('2026-10-17')).toBe('Saturday, 17 October 2026');
    expect(longDate('2026-01-01')).toBe('Thursday, 1 January 2026');
  });

  test('a malformed date gives an empty string instead of throwing', () => {
    expect(longDate('not-a-date')).toBe('');
  });
});
