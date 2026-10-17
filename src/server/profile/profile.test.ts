import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_PROFILE } from '@/contracts/fixtures';
import { ProfileSchema } from '@/contracts/api';
import { fakeSupabase, eqOf, type Query, type Result } from '@/server/learn/__fixtures__/fakeSupabase';

let resolver: (q: Query) => Result | undefined = () => undefined;
let calls: Query[] = [];
vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () => {
    const f = fakeSupabase((q) => resolver(q));
    calls = f.calls;
    return f.client as never;
  },
}));

const { getProfile } = await import('./index');
const REAL_ID = '6f1c2a9e-1111-4c4c-9d9d-000000000001';

const row = (p: Record<string, unknown> = {}) => ({
  user_id: REAL_ID,
  display_name: 'Ayesha',
  paper_name: 'The Morrow',
  tz: 'Asia/Karachi',
  city: 'Islamabad',
  time_budget: 15,
  depth: 'basics',
  lang: 'en',
  delivery_hour: 7,
  is_demo: true,
  onboarded_at: '2026-10-04T03:30:00+00:00',
  pos_emb: null,
  neg_emb: null,
  n_engaged: 0,
  depth_pref: 0,
  created_at: '2026-10-04T03:00:00+00:00',
  ...p,
});

beforeEach(() => {
  resolver = () => undefined;
});

describe('getProfile', () => {
  it('no row → null', async () => {
    resolver = () => ({ data: null });
    expect(await getProfile('nobody')).toBeNull();
  });

  it('onboarded_at null → null (not onboarded: pages redirect to /start)', async () => {
    resolver = () => ({ data: row({ onboarded_at: null }) });
    expect(await getProfile(REAL_ID)).toBeNull();
  });

  it('a full row with time_budget 15 maps to the Profile contract', async () => {
    resolver = (q) => (q.table === 'profiles' && eqOf(q, 'user_id') === REAL_ID ? { data: row() } : { data: null });
    const p = await getProfile(REAL_ID);
    expect(p).toEqual({ ...FIXTURE_PROFILE, userId: REAL_ID });
    expect(ProfileSchema.safeParse(p).success).toBe(true);
    expect(calls[0].table).toBe('profiles');
  });

  it('time_budget 30 → timeBudget 30; an unknown value falls back to 15', async () => {
    resolver = () => ({ data: row({ time_budget: 30 }) });
    expect((await getProfile(REAL_ID))?.presentation.timeBudget).toBe(30);
    resolver = () => ({ data: row({ time_budget: 20 }) });
    expect((await getProfile(REAL_ID))?.presentation.timeBudget).toBe(15);
  });

  it('fixture mode: FIXTURE_USER_ID gets FIXTURE_PROFILE without touching the DB', async () => {
    resolver = () => {
      throw new Error('the DB must not be called');
    };
    expect(await getProfile(FIXTURE_PROFILE.userId)).toEqual(FIXTURE_PROFILE);
  });

  it('a DB error is thrown, not read as "not onboarded"', async () => {
    resolver = () => ({ error: { message: 'boom' } });
    await expect(getProfile(REAL_ID)).rejects.toThrow(/boom/);
  });
});
