import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edition } from '@/contracts/edition';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { getEdition } from '@/server/edition';
import { parseRenderArgs, renderMissingPdfs } from './batch';
import { renderAndStoreEditionPdf } from './storage';

vi.mock('@/server/db/admin', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('@/server/edition', () => ({ getEdition: vi.fn() }));
vi.mock('./storage', () => ({ renderAndStoreEditionPdf: vi.fn() }));

type Row = { user_id: string; edition_date: string; pdf_path: string | null };

/** A recording, thenable stand-in for supabase-js query builders: every filter call is logged. */
function fakeAdmin(rows: Row[], stored = 0) {
  const calls: [string, ...unknown[]][] = [];
  const builder = (result: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'not', 'order']) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => void) => resolve(result());
    return b;
  };
  const from = vi.fn(() => {
    const first = calls.length;
    return builder(() => {
      const mine = calls.slice(first);
      const isCount = mine.some(([m, , opts]) => m === 'select' && (opts as { head?: boolean } | undefined)?.head);
      return isCount ? { count: stored, error: null } : { data: rows, error: null };
    });
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createSupabaseAdminClient>);
  return { calls, from };
}

const DATES = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const rowsFor = (userId: string): Row[] => DATES.map((edition_date) => ({ user_id: userId, edition_date, pdf_path: null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getEdition).mockImplementation(async (userId, date): Promise<Edition> => ({ ...FIXTURE_EDITION, userId, date }));
  vi.mocked(renderAndStoreEditionPdf).mockImplementation(async (e) => `${e.userId}/${e.date}-abcdef012345.pdf`);
});

describe('parseRenderArgs', () => {
  it('takes one reader or every missing paper', () => {
    expect(parseRenderArgs(['--user', 'u1'])).toEqual({ userId: 'u1', allMissing: false, force: false, exportDemo: false });
    expect(parseRenderArgs(['--all-missing'])).toEqual({ userId: undefined, allMissing: true, force: false, exportDemo: false });
    expect(parseRenderArgs(['--user', 'u1', '--force', '--export-demo'])).toEqual({ userId: 'u1', allMissing: false, force: true, exportDemo: true });
  });

  it('refuses no target, both targets, a missing id, an unknown flag and --export-demo without a reader', () => {
    expect(() => parseRenderArgs([])).toThrow(/usage/i);
    expect(() => parseRenderArgs(['--user', 'u1', '--all-missing'])).toThrow(/usage/i);
    expect(() => parseRenderArgs(['--user'])).toThrow(/usage/i);
    expect(() => parseRenderArgs(['--user', '--force'])).toThrow(/usage/i);
    expect(() => parseRenderArgs(['--all-missing', '--colour'])).toThrow(/usage/i);
    expect(() => parseRenderArgs(['--all-missing', '--export-demo'])).toThrow(/usage/i);
  });
});

describe('renderMissingPdfs', () => {
  it('renders each missing paper of the reader once, oldest first', async () => {
    const a = fakeAdmin(rowsFor('u1'), 0);
    const out = await renderMissingPdfs({ userId: 'u1' });
    expect(renderAndStoreEditionPdf).toHaveBeenCalledTimes(8);
    expect(vi.mocked(renderAndStoreEditionPdf).mock.calls.map(([e]) => e.date)).toEqual(DATES);
    expect(getEdition).toHaveBeenCalledWith('u1', '2026-10-10');
    expect(out.rendered).toEqual(DATES);
    expect(out.failed).toEqual([]);
    expect(a.calls).toContainEqual(['eq', 'user_id', 'u1']);
    expect(a.calls).toContainEqual(['is', 'pdf_path', null]);
    expect(a.calls).toContainEqual(['order', 'edition_date', { ascending: true }]);
  });

  it('keeps going when one paper fails, and reports its date', async () => {
    fakeAdmin(rowsFor('u1'));
    vi.mocked(renderAndStoreEditionPdf).mockImplementation(async (e) => {
      if (e.date === '2026-10-13') throw new Error('chrome crashed');
      return `${e.userId}/${e.date}.pdf`;
    });
    const out = await renderMissingPdfs({ userId: 'u1' });
    expect(out.failed).toEqual(['2026-10-13']);
    expect(out.rendered).toHaveLength(7);
  });

  it('reports a paper whose edition is gone as failed', async () => {
    fakeAdmin(rowsFor('u1').slice(0, 2));
    vi.mocked(getEdition).mockResolvedValueOnce(null);
    const out = await renderMissingPdfs({ userId: 'u1' });
    expect(out.failed).toEqual(['2026-10-10']);
    expect(out.rendered).toEqual(['2026-10-11']);
  });

  it('re-renders stored papers with force, and counts the ones it skipped otherwise', async () => {
    const forced = fakeAdmin(rowsFor('u1'));
    await renderMissingPdfs({ userId: 'u1', force: true });
    expect(forced.calls.some(([m, col]) => m === 'is' && col === 'pdf_path')).toBe(false);

    fakeAdmin([], 8);
    const out = await renderMissingPdfs({ userId: 'u1' });
    expect(out.rendered).toEqual([]);
    expect(out.skipped).toBe(8);
  });

  it('covers every reader without a user filter', async () => {
    const a = fakeAdmin([...rowsFor('u1').slice(0, 1), ...rowsFor('u2').slice(0, 1)]);
    const out = await renderMissingPdfs({});
    expect(a.calls.some(([m, col]) => m === 'eq' && col === 'user_id')).toBe(false);
    expect(out.rendered).toHaveLength(2);
    expect(getEdition).toHaveBeenCalledWith('u2', '2026-10-10');
  });
});
