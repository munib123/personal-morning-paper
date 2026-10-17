import { describe, expect, it } from 'vitest';
import { localHour, nextMorningIso } from './clock';

describe('nextMorningIso', () => {
  it('is tomorrow at 07:00 local, as UTC', () => {
    expect(nextMorningIso(new Date('2026-10-17T05:00:00Z'), 'Asia/Karachi')).toBe('2026-10-18T02:00:00.000Z');
  });

  it('treats 01:30 as still the previous edition day (03:00 rollover)', () => {
    // 01:30 PKT on the 18th belongs to the 17th's paper, so the next morning is the 18th at 07:00.
    expect(nextMorningIso(new Date('2026-10-17T20:30:00Z'), 'Asia/Karachi')).toBe('2026-10-18T02:00:00.000Z');
  });

  it('handles half-hour offsets', () => {
    expect(nextMorningIso(new Date('2026-10-17T05:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-18T01:30:00.000Z');
  });

  it('falls back to Asia/Karachi for an unknown timezone', () => {
    expect(nextMorningIso(new Date('2026-10-17T05:00:00Z'), 'Not/AZone')).toBe('2026-10-18T02:00:00.000Z');
  });
});

describe('localHour', () => {
  it('reads the hour in the reader timezone (h23)', () => {
    expect(localHour(new Date('2026-10-17T16:00:00Z'), 'Asia/Karachi')).toBe(21);
    expect(localHour(new Date('2026-10-17T19:30:00Z'), 'Asia/Karachi')).toBe(0);
  });
});
