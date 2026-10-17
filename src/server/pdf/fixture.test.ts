import { describe, expect, it } from 'vitest';
import { FIXTURE_EDITION, FIXTURE_LEARNING, FIXTURE_PROFILE } from '@/contracts/fixtures';
import { APP_URL, fixtureExtras } from './fixture';

describe('fixtureExtras', () => {
  it('keeps at most 5 movers, in the learning view order', () => {
    const extras = fixtureExtras();
    expect(extras.movers.length).toBeLessThanOrEqual(5);
    expect(extras.movers).toEqual(FIXTURE_LEARNING.movers.slice(0, 5));
  });

  it('takes the city and the first name from the fixture profile', () => {
    const extras = fixtureExtras();
    expect(extras.city).toBe(FIXTURE_PROFILE.city);
    expect(extras.displayName).toBe(FIXTURE_PROFILE.displayName);
  });

  it('carries no streak: the PDF has no gamification', () => {
    expect('streak' in fixtureExtras()).toBe(false);
  });

  it('points the QR codes at APP_URL', () => {
    expect(fixtureExtras().appUrl).toBe(APP_URL);
    expect(APP_URL).toBe(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  });

  it('builds against a full 20-item fixture edition', () => {
    expect(FIXTURE_EDITION.items.length).toBe(20);
  });
});
