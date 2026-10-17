import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVTO_TAGS, fetchDevto } from './devto';

const fixture = JSON.parse(readFileSync(new URL('../__fixtures__/devto.json', import.meta.url), 'utf8')) as Record<string, unknown>[];

let fetchMock: ReturnType<typeof vi.fn>;
let inFlight = 0;
let peak = 0;
let byTag: Record<string, Response | (() => Response)>;

beforeEach(() => {
  inFlight = 0;
  peak = 0;
  byTag = {};
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight -= 1;
    const tag = new URL(String(input)).searchParams.get('tag') ?? '';
    const hit = byTag[tag];
    if (hit) return typeof hit === 'function' ? hit() : hit;
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchDevto', () => {
  it('asks for the top articles of each tag, one request at a time', async () => {
    await fetchDevto();
    expect(DEVTO_TAGS).toEqual(['javascript', 'webdev', 'ai', 'devops', 'python']);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(
      DEVTO_TAGS.map((t) => `https://dev.to/api/articles?top=1&tag=${t}&per_page=15`),
    );
    expect(peak).toBe(1);
  });

  it('maps an article: url, title, description, cover (else social) image, timestamp, author name', async () => {
    byTag.javascript = Response.json(fixture);
    const items = await fetchDevto();
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      sourceId: 'dev-to',
      link: 'https://dev.to/ana/signals-are-coming-to-javascript-1abc',
      title: 'Signals are coming to JavaScript',
      descriptionHtml: 'A look at the TC39 signals proposal and what it means for frameworks.',
      contentHtml: null,
      imageUrl: 'https://media2.dev.to/dynamic/image/width=1000/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fsignals.png',
      author: 'Ana Torres',
      publishedRaw: '2026-10-17T03:15:00Z',
    });
    expect(items[1].imageUrl).toBe('https://media2.dev.to/dynamic/image/width=1000,height=500/social-small-prs.png');
  });

  it('lists an article that appears under two tags once', async () => {
    byTag.javascript = Response.json(fixture);
    byTag.webdev = Response.json([fixture[0]]);
    const items = await fetchDevto();
    expect(items.map((i) => i.title)).toEqual(['Signals are coming to JavaScript', 'Ship faster with smaller pull requests']);
  });

  it('a tag answering 500 still yields the other tags', async () => {
    byTag.javascript = new Response('oops', { status: 500 });
    byTag.python = Response.json([fixture[1]]);
    const items = await fetchDevto();
    expect(items.map((i) => i.title)).toEqual(['Ship faster with smaller pull requests']);
  });

  it('throws when every tag fails (the source is then marked failed)', async () => {
    for (const t of DEVTO_TAGS) byTag[t] = () => new Response('down', { status: 503 });
    await expect(fetchDevto()).rejects.toThrow('503');
  });
});
