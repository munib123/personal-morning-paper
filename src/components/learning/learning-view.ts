// Pure helpers for the "Your paper learned" and "Your interests" tabs.
import type { InterestWeight } from '@/contracts/profile';
import type { SignalType, WeightDelta } from '@/contracts/signals';
import { ancestorsOf, type TopicSlug } from '@/contracts/taxonomy';

export interface BarRow {
  slug: TopicSlug;
  name: string;
  level: 1 | 2 | 3;
  theta: number;
  delta: number | null; // the learned change (after − before) when this topic moved
  muted: boolean;
  pinned: boolean;
  children: BarRow[];
}

/** A change in interest weight, in points: '+12 pts', '−3 pts' (true minus sign) or 'no change'. */
export function deltaLabel(before: number, after: number): string {
  const pts = Math.round((after - before) * 100);
  if (pts === 0) return 'no change';
  return pts > 0 ? `+${pts} pts` : `−${Math.abs(pts)} pts`;
}

const byTheta = (a: BarRow, b: BarRow) => b.theta - a.theta || a.name.localeCompare(b.name);

/**
 * Roots sorted by weight, each with every descendant nested under it (also sorted). A topic whose root
 * is not in `weights` is shown as a root. Muted topics are left out unless `includeMuted`.
 * `override` replaces theta (simulation snapshots); a mover's delta lands on its slug.
 */
export function barRows(
  weights: InterestWeight[],
  movers: WeightDelta[],
  override?: Record<TopicSlug, number>,
  opts?: { includeMuted?: boolean },
): BarRow[] {
  const deltaBySlug = new Map(movers.map((m) => [m.slug, m.after - m.before]));
  const rows = new Map<TopicSlug, BarRow>();
  for (const w of weights) {
    if (w.muted && !opts?.includeMuted) continue;
    rows.set(w.slug, {
      slug: w.slug,
      name: w.name,
      level: w.level,
      theta: override?.[w.slug] ?? w.theta,
      delta: deltaBySlug.get(w.slug) ?? null,
      muted: w.muted,
      pinned: w.pinned,
      children: [],
    });
  }
  const top: BarRow[] = [];
  for (const row of rows.values()) {
    const root = ancestorsOf(row.slug)[0];
    const parent = root === undefined ? undefined : rows.get(root);
    if (parent) parent.children.push(row);
    else top.push(row);
  }
  for (const r of top) r.children.sort(byTheta);
  return top.sort(byTheta);
}

const LABELS: Record<SignalType, string> = {
  impression: 'Saw',
  open: 'Opened',
  dwell: 'Read',
  read_original: 'Read the original',
  skip: 'Skipped',
  more: 'Asked for more',
  less: 'Asked for less',
  save: 'Saved',
  share: 'Shared',
  pdf_download: 'Downloaded the PDF',
  qr_scan: 'Scanned the print QR',
  recall_answer: 'Answered recall',
  audio_play: 'Listened',
  taste_more: 'Liked a sample',
  taste_less: 'Passed on a sample',
  taste_skip: 'Skipped a sample',
  hide_source: 'Hid a source',
  weight_edit: 'Changed an interest',
};

export function timelineLabel(type: SignalType): string {
  return LABELS[type] ?? type;
}

/** '18m ago', '1h ago', '2d ago' relative to `nowIso` (the request's time, passed down). */
export function timeAgo(at: string, nowIso: string): string {
  const s = Math.floor((Date.parse(nowIso) - Date.parse(at)) / 1000);
  if (!Number.isFinite(s) || s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Movers split into rises (largest first) and drops (largest first). */
export function splitMovers(movers: WeightDelta[]): { up: WeightDelta[]; down: WeightDelta[] } {
  const change = (m: WeightDelta) => m.after - m.before;
  return {
    up: movers.filter((m) => change(m) > 0).sort((a, b) => change(b) - change(a)),
    down: movers.filter((m) => change(m) < 0).sort((a, b) => change(a) - change(b)),
  };
}
