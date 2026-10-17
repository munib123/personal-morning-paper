import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Edition } from '@/contracts/edition';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { fixtureExtras } from './fixture';
import { editionPdfHash, pdfObjectPath, PRINT_VERSION } from './hash';
import { getEditionPdfUrl, renderAndStoreEditionPdf } from './index';
import { renderEditionPdf } from './render';
import { ensurePapersBucket, PAPERS_BUCKET, resetPapersBucketMemo, SIGNED_URL_TTL_S } from './storage';

vi.mock('@/server/db/admin', () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock('./render', () => ({ renderEditionPdf: vi.fn() }));
vi.mock('./extras', () => ({ loadPrintExtras: vi.fn(async () => fixtureExtras()) }));

const PDF = new Uint8Array([37, 80, 68, 70]); // %PDF

/** A stand-in for the service-role client: just the chains L6 calls. */
function fakeAdmin(opts: { pdfPath?: string | null; signError?: boolean; uploadError?: boolean; bucketExists?: boolean } = {}) {
  const createSignedUrl = vi.fn(async (path: string) =>
    opts.signError
      ? { data: null, error: { message: 'Object not found' } }
      : { data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/${PAPERS_BUCKET}/${path}?token=t` }, error: null },
  );
  const upload = vi.fn(async () => (opts.uploadError ? { data: null, error: { message: 'Payload too large' } } : { data: { path: 'p' }, error: null }));
  const getBucket = vi.fn(async () =>
    opts.bucketExists === false ? { data: null, error: { message: 'Bucket not found' } } : { data: { id: PAPERS_BUCKET }, error: null },
  );
  const createBucket = vi.fn(async () => ({ data: { name: PAPERS_BUCKET }, error: null }));
  const maybeSingle = vi.fn(async () => ({ data: opts.pdfPath === undefined ? null : { pdf_path: opts.pdfPath }, error: null }));
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const updateEq = vi.fn(async () => ({ data: null, error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, update }));
  const storageFrom = vi.fn(() => ({ createSignedUrl, upload }));
  const client = { from, storage: { from: storageFrom, getBucket, createBucket } };
  vi.mocked(createSupabaseAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createSupabaseAdminClient>);
  return { client, from, select, selectEq, update, updateEq, storageFrom, createSignedUrl, upload, getBucket, createBucket };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPapersBucketMemo();
  vi.mocked(renderEditionPdf).mockResolvedValue({ pdf: PDF, pages: 5, attempts: 1, overflow: [], ms: 10 });
});

describe('editionPdfHash and pdfObjectPath', () => {
  it('is a stable 12-hex fingerprint of the printed paper', () => {
    const h = editionPdfHash(FIXTURE_EDITION);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(editionPdfHash(FIXTURE_EDITION)).toBe(h);
    expect(PRINT_VERSION).toBe('print-v2-morrow');
  });

  it('changes when a story changes tier', () => {
    const changed: Edition = {
      ...FIXTURE_EDITION,
      items: FIXTURE_EDITION.items.map((i, k) => (k === 3 ? { ...i, tier: i.tier === 'brief' ? 'deep' : 'brief' } : i)),
    };
    expect(editionPdfHash(changed)).not.toBe(editionPdfHash(FIXTURE_EDITION));
  });

  it('keys the object by user and date, without the bucket prefix', () => {
    const path = pdfObjectPath(FIXTURE_EDITION);
    expect(path).toMatch(/^[^/]+\/\d{4}-\d{2}-\d{2}-[0-9a-f]{12}\.pdf$/);
    expect(path.startsWith(`${FIXTURE_EDITION.userId}/${FIXTURE_EDITION.date}-`)).toBe(true);
    expect(path.startsWith(`${PAPERS_BUCKET}/`)).toBe(false);
  });
});

describe('getEditionPdfUrl', () => {
  it('returns null, without signing, when nothing is stored', async () => {
    const a = fakeAdmin({ pdfPath: null });
    expect(await getEditionPdfUrl('e1')).toBeNull();
    expect(a.selectEq).toHaveBeenCalledWith('id', 'e1');
    expect(a.createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns null for an unknown edition', async () => {
    const a = fakeAdmin();
    expect(await getEditionPdfUrl('missing')).toBeNull();
    expect(a.createSignedUrl).not.toHaveBeenCalled();
  });

  it('signs the stored object for an hour', async () => {
    const a = fakeAdmin({ pdfPath: 'u1/2026-10-17-abcdef012345.pdf' });
    const url = await getEditionPdfUrl('e1');
    expect(a.storageFrom).toHaveBeenCalledWith(PAPERS_BUCKET);
    expect(a.createSignedUrl).toHaveBeenCalledWith('u1/2026-10-17-abcdef012345.pdf', SIGNED_URL_TTL_S);
    expect(SIGNED_URL_TTL_S).toBe(3600);
    expect(url).toBe('https://x.supabase.co/storage/v1/object/sign/papers/u1/2026-10-17-abcdef012345.pdf?token=t');
  });

  it('returns null when signing fails', async () => {
    fakeAdmin({ pdfPath: 'u1/x.pdf', signError: true });
    expect(await getEditionPdfUrl('e1')).toBeNull();
  });
});

describe('renderAndStoreEditionPdf', () => {
  it('renders, uploads, records pdf_path and returns the path', async () => {
    const a = fakeAdmin();
    const path = await renderAndStoreEditionPdf(FIXTURE_EDITION);
    expect(path).toBe(pdfObjectPath(FIXTURE_EDITION));
    expect(renderEditionPdf).toHaveBeenCalledWith(FIXTURE_EDITION, fixtureExtras());
    expect(a.upload).toHaveBeenCalledWith(path, PDF, { contentType: 'application/pdf', upsert: true });
    expect(a.from).toHaveBeenCalledWith('editions');
    expect(a.update).toHaveBeenCalledWith({ pdf_path: path });
    expect(a.updateEq).toHaveBeenCalledWith('id', FIXTURE_EDITION.id);
  });

  it('throws when the upload fails, and records nothing', async () => {
    const a = fakeAdmin({ uploadError: true });
    await expect(renderAndStoreEditionPdf(FIXTURE_EDITION)).rejects.toThrow(/upload/);
    expect(a.update).not.toHaveBeenCalled();
  });
});

describe('ensurePapersBucket', () => {
  it('leaves the migration-made bucket alone', async () => {
    const a = fakeAdmin({ bucketExists: true });
    await ensurePapersBucket(a.client as unknown as ReturnType<typeof createSupabaseAdminClient>);
    expect(a.getBucket).toHaveBeenCalledWith(PAPERS_BUCKET);
    expect(a.createBucket).not.toHaveBeenCalled();
  });

  it('creates a private bucket once when it is missing', async () => {
    const a = fakeAdmin({ bucketExists: false });
    const admin = a.client as unknown as ReturnType<typeof createSupabaseAdminClient>;
    await ensurePapersBucket(admin);
    await ensurePapersBucket(admin);
    expect(a.createBucket).toHaveBeenCalledTimes(1);
    expect(a.createBucket).toHaveBeenCalledWith(PAPERS_BUCKET, { public: false });
  });
});
