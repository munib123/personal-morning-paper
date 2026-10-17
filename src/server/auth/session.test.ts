import { beforeEach, describe, expect, it, vi } from 'vitest';

const claimsResult = { current: { data: { claims: null as Record<string, unknown> | null }, error: null as unknown } };
vi.mock('@/server/db/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => claimsResult.current },
  }),
}));

import { getSessionUser, requireUser } from './session';

describe('session', () => {
  beforeEach(() => {
    claimsResult.current = { data: { claims: null }, error: null };
  });

  it('maps claims to the session user', async () => {
    claimsResult.current = { data: { claims: { sub: 'u1', is_anonymous: true } }, error: null };
    expect(await getSessionUser()).toEqual({ userId: 'u1', isAnonymous: true });
  });

  it('treats missing is_anonymous as a permanent user', async () => {
    claimsResult.current = { data: { claims: { sub: 'u2' } }, error: null };
    expect(await getSessionUser()).toEqual({ userId: 'u2', isAnonymous: false });
  });

  it('returns null without claims', async () => {
    expect(await getSessionUser()).toBeNull();
  });

  it('requireUser rejects with a 401 Response', async () => {
    const err = await requireUser().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(401);
  });

  it('requireUser resolves for a signed-in user', async () => {
    claimsResult.current = { data: { claims: { sub: 'u3', is_anonymous: false } }, error: null };
    expect(await requireUser()).toEqual({ userId: 'u3', isAnonymous: false });
  });
});
