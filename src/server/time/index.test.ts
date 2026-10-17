import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieValue = { current: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'subah_now' && cookieValue.current !== undefined ? { name, value: cookieValue.current } : undefined),
  }),
}));

import { addDays, localDate, requestNow } from './index';

describe('localDate (03:00 rollover)', () => {
  it('02:30 PKT on the 18th still belongs to the 17th', () => {
    expect(localDate(new Date('2026-10-17T21:30:00Z'), 'Asia/Karachi')).toBe('2026-10-17');
  });
  it('03:00 PKT starts the 18th', () => {
    expect(localDate(new Date('2026-10-17T22:00:00Z'), 'Asia/Karachi')).toBe('2026-10-18');
  });
  it('daytime PKT', () => {
    expect(localDate(new Date('2026-10-17T05:00:00Z'), 'Asia/Karachi')).toBe('2026-10-17');
  });
  it('works for UTC', () => {
    expect(localDate(new Date('2026-10-18T02:59:59Z'), 'UTC')).toBe('2026-10-17');
  });
  it('falls back to Asia/Karachi on an unknown tz', () => {
    expect(localDate(new Date('2026-10-17T22:00:00Z'), 'Not/AZone')).toBe('2026-10-18');
  });
});

describe('addDays', () => {
  it('crosses month ends and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-10-17', 0)).toBe('2026-10-17');
  });
});

describe('requestNow', () => {
  const fixed = new Date('2026-10-17T07:00:00.000Z');
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
  });
  afterEach(() => {
    vi.useRealTimers();
    cookieValue.current = undefined;
    delete process.env.DEMO_MODE;
  });

  it('uses the demo cookie when DEMO_MODE=1', async () => {
    process.env.DEMO_MODE = '1';
    cookieValue.current = '2026-10-18T02:00:00.000Z';
    expect((await requestNow()).toISOString()).toBe('2026-10-18T02:00:00.000Z');
  });
  it('ignores the cookie when DEMO_MODE is unset', async () => {
    cookieValue.current = '2026-10-18T02:00:00.000Z';
    expect((await requestNow()).toISOString()).toBe(fixed.toISOString());
  });
  it('ignores a garbage or empty cookie', async () => {
    process.env.DEMO_MODE = '1';
    cookieValue.current = 'yesterday';
    expect((await requestNow()).toISOString()).toBe(fixed.toISOString());
    cookieValue.current = '';
    expect((await requestNow()).toISOString()).toBe(fixed.toISOString());
  });
});
