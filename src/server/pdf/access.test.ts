import { describe, expect, it } from 'vitest';
import { isPaperDate, wantsFixture } from './access';

describe('wantsFixture', () => {
  it('serves the fixture paper on ?fixture=1 in development or demo mode', () => {
    expect(wantsFixture('1', { NODE_ENV: 'development' })).toBe(true);
    expect(wantsFixture('1', { NODE_ENV: 'production', DEMO_MODE: '1' })).toBe(true);
  });

  it('never serves it in production without demo mode, or without the flag', () => {
    expect(wantsFixture('1', { NODE_ENV: 'production' })).toBe(false);
    expect(wantsFixture(undefined, { NODE_ENV: 'development' })).toBe(false);
    expect(wantsFixture('0', { NODE_ENV: 'development' })).toBe(false);
    expect(wantsFixture(['1', '1'], { NODE_ENV: 'development' })).toBe(false);
  });
});

describe('isPaperDate', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isPaperDate('2026-10-17')).toBe(true);
    expect(isPaperDate('2026-10-1')).toBe(false);
    expect(isPaperDate('../etc')).toBe(false);
    expect(isPaperDate('2026-10-17x')).toBe(false);
  });

  it('rejects dates that do not exist', () => {
    expect(isPaperDate('2026-13-99')).toBe(false);
    expect(isPaperDate('2026-02-30')).toBe(false);
  });
});
