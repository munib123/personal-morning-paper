'use client';
// "Other angles" (W2): for a story several outlets covered, what they agree on, each outlet's emphasis
// and where they differ. Collapsed it is one quiet line; expanding it fetches /api/perspectives/{clusterId}
// once (never Gemini: the route answers stored text or the sources' own words). Every outlet links to
// its original through /r, so the click is a read_original signal like any other link to a source.
import { useCallback, useId, useState } from 'react';
import { Button } from '@/components/morrow';
import { ROUTES } from '@/contracts/api';
import type { PerspectivesResponse } from '@/server/perspectives/build';
import { angleRows, differenceLabel, providerLabel, sourcesLabel } from './copy';

export interface PerspectivesPanelProps {
  clusterId: string | null;
  /** Distinct outlets in the cluster (ArticleCard: alsoCoveredBy.length + 1). Below 2 the panel renders nothing. */
  sourceCount: number;
  editionId?: string | null;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <div className="h-4 w-11/12 bg-paper-sunk" />
      <div className="h-4 w-full bg-paper-sunk" />
      <div className="h-4 w-2/3 bg-paper-sunk" />
    </div>
  );
}

export function PerspectivesPanel({ clusterId, sourceCount, editionId = null }: PerspectivesPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<PerspectivesResponse | null>(null);

  const load = useCallback(async () => {
    if (!clusterId) return;
    setStatus('loading');
    try {
      const res = await fetch(`/api/perspectives/${encodeURIComponent(clusterId)}`);
      if (!res.ok) throw new Error(`perspectives ${res.status}`);
      const body = (await res.json()) as PerspectivesResponse;
      if (!body?.perspectives || !Array.isArray(body.sources)) throw new Error('perspectives: malformed body');
      setData(body);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [clusterId]);

  if (!clusterId || sourceCount < 2) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && status === 'idle') void load();
  };

  const p = data?.perspectives ?? null;
  const rows = data ? angleRows(data.perspectives.angles, data.sources) : [];
  // The card's count comes from alsoCoveredBy (at most 5 names); once loaded, the real source list wins.
  const count = data && data.sources.length > 0 ? data.sources.length : sourceCount;
  const meta = [sourcesLabel(count), p ? differenceLabel(p.disagreements.length) : null].filter(Boolean).join(' · ');

  return (
    <div className="border-t border-rule pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="ui-meta text-ink-soft">{meta}</p>
        <Button variant="ghost" size="sm" iconRight={open ? 'minus' : 'plus'} aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          Other angles
        </Button>
      </div>
      {open ? (
        <section id={panelId} aria-label="Other angles" aria-busy={status === 'loading'} className="mt-3 flex flex-col gap-4">
          <p className="kicker text-press">Other angles</p>
          {status === 'loading' || status === 'idle' ? <Skeleton /> : null}
          {status === 'error' ? (
            <div className="flex items-center justify-between gap-3">
              <p className="ui-text text-ink-soft">Other angles are not available right now.</p>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : null}
          {status === 'ready' && p ? (
            <>
              {p.summary ? <p className="deck text-ink">{p.summary}</p> : null}
              <ul className="flex flex-col divide-y divide-rule border-y border-rule">
                {rows.map((row) => (
                  <li key={`${row.name}-${row.articleId ?? row.url}`}>
                    <a
                      href={row.articleId ? ROUTES.outbound(row.articleId, 'web', editionId) : row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-1 py-3 text-ink no-underline focus-visible:outline-2 focus-visible:outline-pen"
                    >
                      <span className="ui-label text-ink-muted">{row.name}</span>
                      <span className="headline-sm text-ink">{row.headline}</span>
                      {row.angle ? <span className="body-sm text-ink-soft">{row.angle}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
              {p.disagreements.length > 0 ? (
                <div>
                  <p className="ui-label text-ink-muted">Where they differ</p>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                    {p.disagreements.map((d) => (
                      <li key={d} className="body-sm text-ink">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="ui-meta text-ink-muted">
                Written from {sourcesLabel(count)} · {providerLabel(p.provider)}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default PerspectivesPanel;
