import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_ARTICLES } from '@/contracts/fixtures';

const NOW = new Date('2026-10-17T06:00:00Z');
const ARTICLE = '11111111-1111-4111-8111-111111111111';
const EDITION = '22222222-2222-4222-8222-222222222222';
const URL_OK = 'https://www.dawn.com/news/1';

const learn = vi.hoisted(() => ({ processSignals: vi.fn() }));
const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
const db = vi.hoisted(() => ({
  rows: { articles: {} as Record<string, { url: string }>, editions: {} as Record<string, { user_id: string }> },
  from: vi.fn(),
}));

vi.mock('@/server/learn', () => ({ processSignals: learn.processSignals }));
vi.mock('@/server/auth/session', () => ({ getSessionUser: session.getSessionUser }));
vi.mock('@/server/time', () => ({ requestNow: async () => NOW }));
vi.mock('@/server/db/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: (table: 'articles' | 'editions') => {
      db.from(table);
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: db.rows[table][id] ?? null, error: null }),
          }),
        }),
      };
    },
  }),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));

import { GET } from './route';

const call = (articleId: string, query = '') =>
  GET(new Request(`http://localhost:3004/r/${articleId}${query}`), { params: Promise.resolve({ articleId }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.rows.articles = { [ARTICLE]: { url: URL_OK } };
  db.rows.editions = { [EDITION]: { user_id: 'u9' } };
  session.getSessionUser.mockResolvedValue({ userId: 'u1', isAnonymous: true });
  learn.processSignals.mockResolvedValue({});
});

describe('GET /r/[articleId]', () => {
  it('src=web with session: 302 to the article and logs read_original', async () => {
    const res = await call(ARTICLE, `?src=web&e=${EDITION}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(URL_OK);
    expect(learn.processSignals).toHaveBeenCalledTimes(1);
    expect(learn.processSignals).toHaveBeenCalledWith(
      'u1',
      [{ type: 'read_original', articleId: ARTICLE, editionId: EDITION, meta: { src: 'web' } }],
      NOW,
    );
  });

  it('src=print attributes the scan to the edition owner', async () => {
    session.getSessionUser.mockResolvedValue(null);
    const res = await call(ARTICLE, `?src=print&e=${EDITION}`);
    expect(res.status).toBe(302);
    expect(learn.processSignals).toHaveBeenCalledWith(
      'u9',
      [{ type: 'qr_scan', articleId: ARTICLE, editionId: EDITION, meta: { src: 'print' } }],
      NOW,
    );
  });

  it('print with an unknown edition still redirects, logging nothing', async () => {
    const res = await call(ARTICLE, '?src=print&e=33333333-3333-4333-8333-333333333333');
    expect(res.status).toBe(302);
    expect(learn.processSignals).not.toHaveBeenCalled();
    const noEdition = await call(ARTICLE, '?src=print');
    expect(noEdition.status).toBe(302);
    expect(learn.processSignals).not.toHaveBeenCalled();
  });

  it('web without a session redirects without logging', async () => {
    session.getSessionUser.mockResolvedValue(null);
    const res = await call(ARTICLE, '?src=web');
    expect(res.status).toBe(302);
    expect(learn.processSignals).not.toHaveBeenCalled();
  });

  it('a missing src behaves as web; an invalid e is dropped', async () => {
    const res = await call(ARTICLE, '?e=not-a-uuid');
    expect(res.status).toBe(302);
    expect(learn.processSignals).toHaveBeenCalledWith('u1', [{ type: 'read_original', articleId: ARTICLE, meta: { src: 'web' } }], NOW);
  });

  it('a failing processSignals never breaks the redirect', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    learn.processSignals.mockRejectedValue(new Error('db down'));
    const res = await call(ARTICLE, '?src=web');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(URL_OK);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('unknown id → 404, nothing logged', async () => {
    const res = await call('44444444-4444-4444-8444-444444444444', '?src=web');
    expect(res.status).toBe(404);
    expect(learn.processSignals).not.toHaveBeenCalled();
  });

  it('a non-uuid id → 404 without touching the database', async () => {
    const res = await call('not-a-uuid', '?src=web');
    expect(res.status).toBe(404);
    expect(db.from).not.toHaveBeenCalled();
    expect(learn.processSignals).not.toHaveBeenCalled();
  });

  it('a javascript: or data: url is never followed', async () => {
    db.rows.articles[ARTICLE] = { url: 'javascript:alert(1)' };
    expect((await call(ARTICLE, '?src=web')).status).toBe(404);
    db.rows.articles[ARTICLE] = { url: 'data:text/html,hi' };
    expect((await call(ARTICLE, '?src=web')).status).toBe(404);
    db.rows.articles[ARTICLE] = { url: 'not a url' };
    expect((await call(ARTICLE, '?src=web')).status).toBe(404);
    expect(learn.processSignals).not.toHaveBeenCalled();
  });

  it('fixture articles (the demo preview) redirect to their source without logging', async () => {
    const fixture = FIXTURE_ARTICLES[0];
    const res = await call(fixture.id, '?src=web');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(new URL(fixture.url).toString());
    expect(learn.processSignals).not.toHaveBeenCalled();
  });
});
