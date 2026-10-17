import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock(import('@/server/edition/job'), () => ({ runEditionsJob: vi.fn(async () => ({ users: 1, built: 1, pdfs: 0, failed: [], ms: 5 })) }));
vi.mock(import('@/server/time'), async (orig) => ({ ...(await orig()), requestNow: vi.fn(async () => new Date('2026-10-17T00:00:00Z')) }));

const job = await import('@/server/edition/job');
const { GET, POST } = await import('./route');

const call = (h: typeof GET, auth?: string) => h(new Request('http://localhost/api/cron/editions', { method: 'GET', headers: auth ? { authorization: auth } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('/api/cron/editions', () => {
  it('with the bearer → runEditionsJob with { job: "editions-cron" } (GET and POST)', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    for (const h of [GET, POST]) {
      const res = await call(h, 'Bearer s3cret');
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ built: 1 });
    }
    expect(vi.mocked(job.runEditionsJob)).toHaveBeenCalledWith(new Date('2026-10-17T00:00:00Z'), { job: 'editions-cron' });
  });

  it('without it, or with a wrong one → 401, and the job does not run', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call(GET)).status).toBe(401);
    expect((await call(POST, 'Bearer nope')).status).toBe(401);
    expect(vi.mocked(job.runEditionsJob)).not.toHaveBeenCalled();
  });

  it('with no CRON_SECRET configured it never runs', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call(GET, 'Bearer ')).status).toBe(401);
    expect(vi.mocked(job.runEditionsJob)).not.toHaveBeenCalled();
  });
});
