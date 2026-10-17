import QRCode from 'qrcode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { fixtureExtras } from './fixture';
import { inlineImage } from './images';
import { buildPrintLayout, shrinkLayout, storyHref } from './layout';
import { preparePrintModel } from './model';
import { QR_OPTIONS, qrSvg } from './qr';

// inlineImage keeps its real implementation; the preparePrintModel tests replace it per test.
vi.mock('./images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./images')>();
  return { ...actual, inlineImage: vi.fn(actual.inlineImage) };
});

const URL_A1 = 'https://subah.app/r/a1?src=print&e=e9';

describe('qrSvg', () => {
  it('renders an SVG in Morning ink on transparent, margin 0, level M', async () => {
    const svg = await qrSvg(URL_A1);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toBe(await QRCode.toString(URL_A1, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1b1813', light: '#0000' } }));
    expect(QR_OPTIONS).toMatchObject({ margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1b1813', light: '#0000' } });
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it('decodes to the print URL', () => {
    const segments = QRCode.create(URL_A1, { errorCorrectionLevel: 'M' }).segments as unknown as { data: string | Uint8Array }[];
    const text = segments.map((s) => (typeof s.data === 'string' ? s.data : Buffer.from(s.data).toString('utf8'))).join('');
    expect(text).toBe(URL_A1);
    expect(URL_A1).toBe(storyHref('https://subah.app', 'a1', 'e9'));
  });
});

describe('inlineImage', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  const respond = (body: BodyInit | null, headers: Record<string, string>, status = 200) =>
    vi.fn(async () => new Response(body, { status, headers })) as unknown as typeof fetch;

  it('inlines a small image as a data URI', async () => {
    const fetchImpl = respond(new Uint8Array(10), { 'content-type': 'image/jpeg' });
    const out = await inlineImage('https://img.example/a.jpg', { fetchImpl });
    expect(out).toMatch(/^data:image\/jpeg;base64,/);
    expect(out).toBe(`data:image/jpeg;base64,${Buffer.alloc(10).toString('base64')}`);
  });

  it('keeps the bare media type when the header carries parameters', async () => {
    const fetchImpl = respond(new Uint8Array(4), { 'content-type': 'image/png; charset=binary' });
    expect(await inlineImage('https://img.example/a.png', { fetchImpl })).toMatch(/^data:image\/png;base64,/);
  });

  it('refuses a page that is not an image', async () => {
    const fetchImpl = respond('<html></html>', { 'content-type': 'text/html' });
    expect(await inlineImage('https://img.example/a', { fetchImpl })).toBeNull();
    expect(warn).toHaveBeenCalledWith('[pdf] image skipped', expect.objectContaining({ host: 'img.example' }));
  });

  it('refuses an image that declares more than the cap', async () => {
    const fetchImpl = respond(new Uint8Array(10), { 'content-type': 'image/jpeg', 'content-length': '5000000' });
    expect(await inlineImage('https://img.example/big.jpg', { fetchImpl })).toBeNull();
  });

  it('refuses a body larger than maxBytes even without a length header', async () => {
    const fetchImpl = respond(new Uint8Array(2000), { 'content-type': 'image/jpeg' });
    expect(await inlineImage('https://img.example/big.jpg', { fetchImpl, maxBytes: 1000 })).toBeNull();
  });

  it('gives up on a host that never answers', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const started = Date.now();
    expect(await inlineImage('https://slow.example/a.jpg', { fetchImpl, timeoutMs: 50 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('refuses a 404 and a fetch that throws', async () => {
    expect(await inlineImage('https://img.example/x.jpg', { fetchImpl: respond('nope', { 'content-type': 'image/jpeg' }, 404) })).toBeNull();
    const boom = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await inlineImage('https://img.example/x.jpg', { fetchImpl: boom })).toBeNull();
  });

  it('fetches only http(s) URLs, and nothing for a missing URL', async () => {
    const fetchImpl = respond(new Uint8Array(1), { 'content-type': 'image/jpeg' });
    expect(await inlineImage('ftp://x', { fetchImpl })).toBeNull();
    expect(await inlineImage('not a url', { fetchImpl })).toBeNull();
    expect(await inlineImage(null, { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('preparePrintModel', () => {
  beforeEach(() => vi.mocked(inlineImage).mockResolvedValue('data:image/png;base64,AAAA'));
  afterEach(() => vi.mocked(inlineImage).mockReset());

  it('makes a QR code for the lead, rail and inner stories, and pictures for the lead and section leads only', async () => {
    const model = await preparePrintModel(FIXTURE_EDITION, fixtureExtras());
    const l = model.layout;
    const qrIds = [l.lead, ...l.rail, ...l.inner.flatMap((p) => p.items)].map((i) => i.article.id);
    expect(Object.keys(model.assets.qr).sort()).toEqual([...qrIds].sort());
    expect(Object.keys(model.assets.qr)).toHaveLength(1 + l.rail.length + l.inner.reduce((n, p) => n + p.items.length, 0));
    for (const svg of Object.values(model.assets.qr)) expect(svg.startsWith('<svg')).toBe(true);
    const imageIds = [l.lead, ...l.inner.map((p) => p.items[0])].map((i) => i.article.id);
    expect(Object.keys(model.assets.images).sort()).toEqual([...imageIds].sort());
    expect(vi.mocked(inlineImage)).toHaveBeenCalledTimes(imageIds.length);
    expect(vi.mocked(inlineImage)).toHaveBeenCalledWith(l.lead.article.imageUrl);
  });

  it('lays out the paper it is given', async () => {
    const shrunk = shrinkLayout(buildPrintLayout(FIXTURE_EDITION), [2])!;
    const model = await preparePrintModel(FIXTURE_EDITION, fixtureExtras(), shrunk);
    expect(model.layout).toBe(shrunk);
    expect(model.edition).toBe(FIXTURE_EDITION);
  });
});
