import { describe, expect, it, vi } from 'vitest';

// Outside a request scope (scripts, jobs) next/headers' cookies() throws.
vi.mock('next/headers', () => ({
  cookies: async () => {
    throw new Error('`cookies` was called outside a request scope');
  },
}));

import { requestNow } from './index';

describe('requestNow outside a request scope', () => {
  it('returns the real clock instead of throwing', async () => {
    process.env.DEMO_MODE = '1';
    const before = Date.now();
    const now = await requestNow();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    delete process.env.DEMO_MODE;
  });
});
