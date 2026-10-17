import { describe, expect, it } from 'vitest';
import { clockLabel } from '@/components/streak/settings';
import { nextTab, parseMeTab } from './me-tabs';

describe('/me tabs', () => {
  it('parseMeTab reads ?tab= and defaults to the learned tab', () => {
    expect(parseMeTab('streak')).toBe('streak');
    expect(parseMeTab(['interests', 'streak'])).toBe('interests');
    expect(parseMeTab(undefined)).toBe('learned');
    expect(parseMeTab('junk')).toBe('learned');
  });

  it('nextTab moves with the arrow keys (wrapping), Home and End', () => {
    expect(nextTab('learned', 'ArrowRight')).toBe('interests');
    expect(nextTab('streak', 'ArrowRight')).toBe('learned');
    expect(nextTab('learned', 'ArrowLeft')).toBe('streak');
    expect(nextTab('interests', 'Home')).toBe('learned');
    expect(nextTab('interests', 'End')).toBe('streak');
    expect(nextTab('interests', 'a')).toBeNull();
  });
});

describe('demo clock label', () => {
  it('shows real time without a demo clock, else the local date and time', () => {
    expect(clockLabel(null, 'Asia/Karachi')).toBe('real time');
    expect(clockLabel('2026-10-18T02:00:00.000Z', 'Asia/Karachi')).toBe('Sun 18 Oct, 07:00');
    expect(clockLabel('not a date', 'Asia/Karachi')).toBe('real time');
  });
});
