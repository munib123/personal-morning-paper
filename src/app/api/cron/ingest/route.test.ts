import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/ingest', () => ({ runIngest: vi.fn() }));
vi.mock('@/server/ingest/store', () => ({ startJobRun: vi.fn(), finishJobRun: vi.fn() }));

import { runIngest, type IngestStats } from '@/server/ingest';
import { finishJobRun, startJobRun } from '@/server/ingest/store';
import { GET, maxDuration, POST, runtime } from './route';

const URL_ = 'http://localhost:3001/api/cron/ingest';
const STATS: IngestStats = { sources: 117, fetched: 3412, inserted: 12, skippedOld: 1489, failedSources: ['the-register'], ms: 41000 };
const call = (handler: (r: Request) => Promise<Response>, auth?: string, method = 'GET') =>
  handler(new Request(URL_, { method, headers: auth === undefined ? {} : { authorization: auth } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 's3cret');
  vi.mocked(runIngest).mockResolvedValue(STATS);
  vi.mocked(startJobRun).mockResolvedValue(42);
  vi.mocked(finishJobRun).mockResolvedValue();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/ingest', () => {
  it('runs on Node for up to 300 s', () => {
    expect(runtime).toBe('nodejs');
    expect(maxDuration).toBe(300);
  });

  it('401 without an Authorization header, and no job_runs row is started', async () => {
    const res = await call(GET);
    expect(res.status).toBe(401);
    expect(startJobRun).not.toHaveBeenCalled();
    expect(runIngest).not.toHaveBeenCalled();
  });

  it('401 with the wrong bearer token', async () => {
    expect((await call(GET, 'Bearer wrong')).status).toBe(401);
    expect((await call(POST, 'Bearer s3cret-but-longer', 'POST')).status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it('401 when CRON_SECRET is unset, even with an empty bearer', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call(GET, 'Bearer ')).status).toBe(401);
    expect((await call(GET, 'Bearer undefined')).status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', GET],
    ['POST', POST],
  ] as const)('200 on %s with the bearer token: runs runIngest only and records one ingest-cron row', async (method, handler) => {
    const res = await call(handler, 'Bearer s3cret', method);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(STATS);
    expect(runIngest).toHaveBeenCalledTimes(1);
    expect(runIngest).toHaveBeenCalledWith({});
    expect(startJobRun).toHaveBeenCalledWith('ingest-cron');
    expect(finishJobRun).toHaveBeenCalledWith(42, 'ok', STATS);
  });

  it('500 with { error } when runIngest throws, after closing the row as error', async () => {
    vi.mocked(runIngest).mockRejectedValueOnce(new Error('load sources: timeout'));
    const res = await call(GET, 'Bearer s3cret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'load sources: timeout' });
    expect(finishJobRun).toHaveBeenCalledWith(42, 'error', { error: 'load sources: timeout' });
  });
});
