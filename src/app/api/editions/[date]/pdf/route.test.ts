import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfFallbackSchema } from '@/contracts/api';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { requireUser } from '@/server/auth/session';
import { getEdition } from '@/server/edition';
import { getEditionPdfUrl, renderAndStoreEditionPdf } from '@/server/pdf';
import { canRenderHere } from '@/server/pdf/browser';
import { GET, maxDuration } from './route';

vi.mock('@/server/auth/session', () => ({ requireUser: vi.fn() }));
vi.mock('@/server/edition', () => ({ getEdition: vi.fn() }));
vi.mock('@/server/pdf', () => ({ getEditionPdfUrl: vi.fn(), renderAndStoreEditionPdf: vi.fn() }));
vi.mock('@/server/pdf/browser', () => ({ canRenderHere: vi.fn() }));

const DATE = '2026-10-17';
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/papers/u1/2026-10-17-abcdef012345.pdf?token=t';
const call = (date = DATE) => GET(new Request(`http://localhost:3006/api/editions/${date}/pdf`), { params: Promise.resolve({ date }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(requireUser).mockResolvedValue({ userId: 'u1', isAnonymous: false });
  vi.mocked(getEdition).mockResolvedValue(FIXTURE_EDITION);
  vi.mocked(canRenderHere).mockReturnValue(true);
  vi.mocked(renderAndStoreEditionPdf).mockResolvedValue('u1/2026-10-17-abcdef012345.pdf');
});

describe('GET /api/editions/[date]/pdf', () => {
  it('allows a full minute for an on-demand render', () => {
    expect(maxDuration).toBe(60);
  });

  it('redirects to the stored PDF without rendering', async () => {
    vi.mocked(getEditionPdfUrl).mockResolvedValue(SIGNED);
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SIGNED);
    expect(renderAndStoreEditionPdf).not.toHaveBeenCalled();
    expect(getEdition).toHaveBeenCalledWith('u1', DATE);
  });

  it('serves the stored PDF on Vercel too', async () => {
    vi.mocked(canRenderHere).mockReturnValue(false);
    vi.mocked(getEditionPdfUrl).mockResolvedValue(SIGNED);
    const res = await call();
    expect(res.status).toBe(302);
    expect(renderAndStoreEditionPdf).not.toHaveBeenCalled();
  });

  it('renders, stores and redirects on a miss where Puppeteer runs', async () => {
    vi.mocked(getEditionPdfUrl).mockResolvedValueOnce(null).mockResolvedValueOnce(SIGNED);
    const res = await call();
    expect(renderAndStoreEditionPdf).toHaveBeenCalledTimes(1);
    expect(renderAndStoreEditionPdf).toHaveBeenCalledWith(FIXTURE_EDITION);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SIGNED);
  });

  it('sends a miss on Vercel straight to the print route, with no render', async () => {
    vi.mocked(canRenderHere).mockReturnValue(false);
    vi.mocked(getEditionPdfUrl).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ fallback: '/paper/2026-10-17/print' });
    expect(renderAndStoreEditionPdf).not.toHaveBeenCalled();
  });

  it('falls back to the print route when the render fails', async () => {
    vi.mocked(getEditionPdfUrl).mockResolvedValue(null);
    vi.mocked(renderAndStoreEditionPdf).mockRejectedValue(new Error('chrome crashed'));
    const res = await call();
    expect(res.status).toBe(503);
    expect(PdfFallbackSchema.parse(await res.json())).toEqual({ fallback: '/paper/2026-10-17/print' });
    expect(console.error).toHaveBeenCalledWith('[pdf] render failed', expect.objectContaining({ date: DATE, userId: 'u1' }));
  });

  it('falls back when the stored object cannot be signed after a render', async () => {
    vi.mocked(getEditionPdfUrl).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ fallback: '/paper/2026-10-17/print' });
  });

  it('answers 401 without a session', async () => {
    vi.mocked(requireUser).mockRejectedValue(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    const res = await call();
    expect(res.status).toBe(401);
    expect(getEdition).not.toHaveBeenCalled();
  });

  it('answers 400 for a date that does not exist', async () => {
    const res = await call('2026-13-99');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_date' });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it('answers 404 when the reader has no edition that day', async () => {
    vi.mocked(getEdition).mockResolvedValue(null);
    const res = await call('2026-10-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no_edition' });
    expect(getEditionPdfUrl).not.toHaveBeenCalled();
  });
});
