import { describe, expect, it } from 'vitest';
import { FIXTURE_TAXONOMY } from '@/contracts/fixtures';
import { selectForEnrichment, type EnrichCandidate } from './select';

const now = new Date('2026-10-17T06:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

let n = 0;
function cand(over: Partial<EnrichCandidate> = {}): EnrichCandidate {
  n++;
  return {
    id: `art-${n}`,
    urlHash: `hash-${n}`,
    clusterId: `cluster-${n}`,
    sourceName: 'Dawn',
    sourceQuality: 0.7,
    wordCount: 300,
    publishedAt: hoursAgo(2),
    importance: 0.5,
    labels: [{ slug: 'business.markets', conf: 1 }],
    title: `Story ${n}`,
    lede: null,
    contentText: null,
    ...over,
  };
}

describe('selectForEnrichment', () => {
  it('one representative per cluster prefers source quality, then word count', () => {
    const best = cand({ clusterId: 'shared', sourceQuality: 0.9, wordCount: 300 });
    const longer = cand({ clusterId: 'shared', sourceQuality: 0.5, wordCount: 900 });
    const sameQualityShorter = cand({ clusterId: 'other', sourceQuality: 0.8, wordCount: 200 });
    const sameQualityLonger = cand({ clusterId: 'other', sourceQuality: 0.8, wordCount: 700 });
    const { llm, extractive } = selectForEnrichment([longer, best, sameQualityShorter, sameQualityLonger], FIXTURE_TAXONOMY, now);
    expect(llm.map((c) => c.id).sort()).toEqual([best.id, sameQualityLonger.id].sort());
    expect(extractive.map((c) => c.id).sort()).toEqual([longer.id, sameQualityShorter.id].sort());
  });

  it('treats an article without a cluster as its own representative', () => {
    const a = cand({ clusterId: null });
    const b = cand({ clusterId: null });
    expect(selectForEnrichment([a, b], FIXTURE_TAXONOMY, now).llm).toHaveLength(2);
  });

  it('caps at 400', () => {
    const rows = Array.from({ length: 500 }, () => cand());
    const { llm, extractive } = selectForEnrichment(rows, FIXTURE_TAXONOMY, now);
    expect(llm).toHaveLength(400);
    expect(extractive).toHaveLength(100);
  });

  it('guarantees 3 per level-2 topic', () => {
    const markets = Array.from({ length: 450 }, () => cand({ importance: 1, publishedAt: hoursAgo(1) }));
    const arts = Array.from({ length: 3 }, () => cand({ importance: 0, publishedAt: hoursAgo(40), labels: [{ slug: 'arts.visual-arts', conf: 1 }] }));
    const { llm } = selectForEnrichment([...markets, ...arts], FIXTURE_TAXONOMY, now);
    expect(llm).toHaveLength(400);
    for (const a of arts) expect(llm.map((c) => c.id)).toContain(a.id);
  });

  it('counts a level-3 label for its level-2 ancestor', () => {
    const markets = Array.from({ length: 450 }, () => cand({ importance: 1, publishedAt: hoursAgo(1) }));
    const web = Array.from({ length: 4 }, () =>
      cand({ importance: 0, publishedAt: hoursAgo(40), labels: [{ slug: 'technical.cs.web-dev', conf: 0.7 }, { slug: 'technical.cs', conf: 0.3 }] }),
    );
    const { llm } = selectForEnrichment([...markets, ...web], FIXTURE_TAXONOMY, now);
    expect(web.filter((w) => llm.some((c) => c.id === w.id))).toHaveLength(3); // 3 guaranteed, not 4
  });

  it('priority = importance + exp(-ageHours/24)', () => {
    const older = cand({ importance: 0.5, publishedAt: hoursAgo(20) });
    const newer = cand({ importance: 0.5, publishedAt: hoursAgo(1) });
    const big = cand({ importance: 1, publishedAt: hoursAgo(20) });
    // newer 0.5 + e^(-1/24) ≈ 1.459 > big 1 + e^(-20/24) ≈ 1.435 > older 0.5 + e^(-20/24) ≈ 0.935
    const { llm } = selectForEnrichment([older, big, newer], FIXTURE_TAXONOMY, now);
    expect(llm.map((c) => c.id)).toEqual([newer.id, big.id, older.id]);
  });

  it('keeps articles too short for Gemini extractive and prefers a member with enough text as representative', () => {
    const thin = cand({ clusterId: null, wordCount: 18 });
    const thinButBest = cand({ clusterId: 'pair', sourceQuality: 0.95, wordCount: 12 });
    const fuller = cand({ clusterId: 'pair', sourceQuality: 0.6, wordCount: 400 });
    const { llm, extractive } = selectForEnrichment([thin, thinButBest, fuller], FIXTURE_TAXONOMY, now);
    expect(llm.map((c) => c.id)).toEqual([fuller.id]);
    expect(extractive.map((c) => c.id).sort()).toEqual([thin.id, thinButBest.id].sort());
  });

  it('respects a custom cap', () => {
    const rows = Array.from({ length: 30 }, () => cand());
    expect(selectForEnrichment(rows, FIXTURE_TAXONOMY, now, { cap: 10 }).llm).toHaveLength(10);
  });
});
