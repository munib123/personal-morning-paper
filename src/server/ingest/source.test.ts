import { describe, expect, it, vi } from 'vitest';
import type { IngestSource, RawItem } from './types';

vi.mock('./adapters/arxiv', async (importOriginal) => ({ ...(await importOriginal<typeof import('./adapters/arxiv')>()), fetchArxiv: vi.fn() }));

import { fetchArxiv } from './adapters/arxiv';
import { processSource } from './source';

const NOW = new Date('2026-10-17T06:00:00Z');
const HOUR = 3_600_000;
const arxivSource: IngestSource = { id: 'arxiv', name: 'arXiv', url: 'https://export.arxiv.org/api/query', kind: 'arxiv', homepage: null, cache: null, failCount: 0 };

const paper = (hoursAgo: number): RawItem => ({
  sourceId: 'x',
  link: `https://arxiv.org/abs/2610.${String(hoursAgo).padStart(5, '0')}`,
  title: `Paper ${hoursAgo}`,
  descriptionHtml: 'An abstract.',
  contentHtml: null,
  imageUrl: null,
  author: 'A. Author',
  publishedRaw: new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
});

describe('processSource (arxiv)', () => {
  it('keeps papers 80 h old: the arXiv window is max(sinceHours, 96)', async () => {
    vi.mocked(fetchArxiv).mockResolvedValueOnce([paper(80), paper(100)]);
    const r = await processSource(arxivSource, NOW, { sinceHours: 48, maxPerSource: 60 });
    expect(r.ok).toBe(true);
    expect(r.fetched).toBe(2);
    expect(r.items.map((i) => i.title)).toEqual(['Paper 80']);
    expect(r.skippedOld).toBe(1);
    expect(r.items[0].sourceId).toBe('arxiv');
  });

  it('a wider sinceHours still wins', async () => {
    vi.mocked(fetchArxiv).mockResolvedValueOnce([paper(80), paper(100)]);
    const r = await processSource(arxivSource, NOW, { sinceHours: 120, maxPerSource: 60 });
    expect(r.items).toHaveLength(2);
  });

  it('marks the source failed when the adapter throws', async () => {
    vi.mocked(fetchArxiv).mockRejectedValueOnce(new Error('arxiv: every category failed'));
    const r = await processSource(arxivSource, NOW, { sinceHours: 48, maxPerSource: 60 });
    expect(r.ok).toBe(false);
    expect(r.cache.error).toContain('every category failed');
  });
});
