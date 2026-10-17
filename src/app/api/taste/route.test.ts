import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { TasteCardSchema } from '@/contracts/api';
import { FIXTURE_TASTE_CARDS } from '@/contracts/fixtures';
import { GET } from './route';

const taste = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/server/onboarding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/onboarding')>()),
  getTasteCards: taste.fn,
}));
vi.mock('@/server/db/admin', () => ({ createSupabaseAdminClient: () => { throw new Error('no database in unit tests'); } }));

const Cards = z.array(TasteCardSchema);
const get = (qs: string) => GET(new Request(`http://localhost/api/taste${qs}`));

beforeEach(async () => {
  const real = await vi.importActual<typeof import('@/server/onboarding')>('@/server/onboarding');
  taste.fn.mockReset();
  taste.fn.mockImplementation(real.getTasteCards);
});

describe('GET /api/taste', () => {
  test('answers 8 fixture cards when the card query throws', async () => {
    taste.fn.mockRejectedValue(new Error('db down'));
    const res = await get('?picks=technical.cs.ai-ml');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FIXTURE_TASTE_CARDS);
  });

  test('no picks still gives 8 valid cards, privately cacheable', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=300');
    const cards = Cards.parse(await res.json());
    expect(cards).toHaveLength(8);
  });

  test('hostile or empty picks never break the preview', async () => {
    const many = Array.from({ length: 500 }, (_, i) => `t${i}`).join(',');
    for (const qs of ['?picks=', '?picks=../x', `?picks=${many}`, '?picks=zzz.unknown,nope', '?picks=%00%3Cscript%3E', '?other=1']) {
      const res = await get(qs);
      expect(res.status).toBe(200);
      const cards = Cards.parse(await res.json());
      expect(cards).toHaveLength(8);
      expect(cards.filter((c) => c.wildcard)).toHaveLength(2);
    }
  });

  test('passes only clean, de-duplicated slugs on', async () => {
    await get('?picks=a,../x,,technical.cs.ai-ml,a');
    expect(taste.fn).toHaveBeenCalledWith(['a', 'technical.cs.ai-ml']);
  });
});
