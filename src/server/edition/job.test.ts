import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { fakeSupabase, type Query } from '@/server/learn/__fixtures__/fakeSupabase';

const NOW = new Date('2026-10-17T01:00:00Z');
const h = vi.hoisted(() => ({ calls: [] as Query[], users: ['u1', 'u2'] as string[] }));

vi.mock(import('@/server/db/admin'), () => ({
  createSupabaseAdminClient: () =>
    fakeSupabase((q) => {
      h.calls.push(q);
      if (q.table === 'profiles') return { data: h.users.map((user_id) => ({ user_id })) };
      if (q.table === 'job_runs' && q.op === 'insert') return { data: { id: 7 } };
      return { data: null };
    }).client as never,
}));
vi.mock(import('./build'), async (orig) => ({ ...(await orig()), buildEdition: vi.fn(async () => FIXTURE_EDITION) }));
vi.mock(import('@/server/pdf'), async (orig) => ({ ...(await orig()), renderAndStoreEditionPdf: vi.fn(async () => 'u1/2026-10-17-abc.pdf') }));

const build = await import('./build');
const pdf = await import('@/server/pdf');
const { runEditionsJob } = await import('./job');

beforeEach(() => {
  h.calls = [];
  h.users = ['u1', 'u2'];
  vi.clearAllMocks();
});

describe('runEditionsJob', () => {
  it('builds every onboarded profile with { force: false, awaitNote: true } and stores the PDFs', async () => {
    const s = await runEditionsJob(NOW, { job: 'editions' });
    expect(s).toMatchObject({ users: 2, built: 2, pdfs: 2, failed: [] });
    expect(vi.mocked(build.buildEdition)).toHaveBeenCalledWith('u1', NOW, { force: false, awaitNote: true });
    const profiles = h.calls.find((q) => q.table === 'profiles')!;
    expect(profiles.filters).toContainEqual(['not', 'onboarded_at', 'is']);
  });

  it('one failing user does not stop the job', async () => {
    vi.mocked(build.buildEdition).mockRejectedValueOnce(new Error('boom'));
    const s = await runEditionsJob(NOW, { job: 'editions' });
    expect(s).toMatchObject({ users: 2, built: 1, failed: ['u1'] });
  });

  it('a PDF failure is counted, and the edition still counts as built', async () => {
    vi.mocked(pdf.renderAndStoreEditionPdf).mockRejectedValue(new Error('no chrome'));
    const s = await runEditionsJob(NOW, { job: 'editions' });
    expect(s).toMatchObject({ built: 2, pdfs: 0, failed: [] });
    vi.mocked(pdf.renderAndStoreEditionPdf).mockReset();
  });

  it('writes one job_runs row with the job name and the stats', async () => {
    await runEditionsJob(NOW, { job: 'editions' });
    const ins = h.calls.filter((q) => q.table === 'job_runs' && q.op === 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].values).toMatchObject({ job: 'editions' });
    const fin = h.calls.find((q) => q.table === 'job_runs' && q.op === 'update')!;
    expect(fin.values).toMatchObject({ status: 'ok', stats: expect.objectContaining({ users: 2, built: 2 }) });
  });
});
