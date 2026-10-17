// Qualifying-read rules (ARCHITECTURE §9.7, §10.7) and the heatmap, as pure functions over one day's
// events. Every count is distinct per article, so replayed or duplicated batches (sendBeacon retries,
// refreshes, a re-sent recall answer) never inflate a day.
import type { SignalEvent, SignalType } from '@/contracts/signals';
import type { HeatmapDay } from '@/contracts/streak';
import type { DayRecord } from './compute';

export interface DayEvent {
  type: SignalType;
  articleId: string | null;
  value: number | null;
  meta: Record<string, unknown>;
}

export interface DaySummary {
  qualifyingReads: number;
  storiesRead: number;
  recallCorrect: number;
  recallTotal: number;
}

const SHEET_DWELL_MS = 20000;
const BYTES_DWELL_MS = 8000;

/** The signal types that can change a day's summary; anything else leaves daily_activity untouched. */
export const READING_TYPES: ReadonlySet<SignalType> = new Set<SignalType>(['open', 'dwell', 'read_original', 'qr_scan', 'recall_answer']);

export function toDayEvent(e: SignalEvent): DayEvent {
  return { type: e.type, articleId: e.articleId ?? null, value: e.value ?? null, meta: e.meta ?? {} };
}

const dwellThreshold = (meta: Record<string, unknown>): number => (meta.mode === 'bytes' ? BYTES_DWELL_MS : SHEET_DWELL_MS);

export function summarizeDay(events: DayEvent[]): DaySummary {
  const opened = new Set<string>();
  const longDwell = new Set<string>(); // articles with one dwell at or over its mode's threshold
  const linkedOut = new Set<string>(); // read_original or qr_scan
  const recallFirst = new Map<string, boolean>(); // recall article → was the first answer right

  for (const e of events) {
    const id = e.articleId;
    if (!id) continue;
    switch (e.type) {
      case 'open':
        opened.add(id);
        break;
      case 'dwell':
        // Max per article, never a sum: a replayed 12 s dwell must not become 24 s.
        if ((e.value ?? 0) >= dwellThreshold(e.meta)) longDwell.add(id);
        break;
      case 'read_original':
      case 'qr_scan':
        linkedOut.add(id);
        break;
      case 'recall_answer':
        if (!recallFirst.has(id)) recallFirst.set(id, e.value === 1);
        break;
      default:
        break;
    }
  }

  const qualifying = new Set<string>(linkedOut);
  for (const id of longDwell) if (opened.has(id)) qualifying.add(id);
  const stories = new Set<string>([...opened, ...longDwell, ...linkedOut]);
  const recallCorrect = [...recallFirst.values()].filter(Boolean).length;

  return {
    qualifyingReads: qualifying.size + recallFirst.size,
    storiesRead: stories.size,
    recallCorrect,
    recallTotal: recallFirst.size,
  };
}

/** Five levels by stories read: 0 · 1–2 · 3–4 · 5–9 · 10+. */
export function heatmapLevel(storiesRead: number): 0 | 1 | 2 | 3 | 4 {
  if (storiesRead <= 0) return 0;
  if (storiesRead <= 2) return 1;
  if (storiesRead <= 4) return 2;
  if (storiesRead <= 9) return 3;
  return 4;
}

function addDaysUtc(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `days` days ending on `today`, oldest first. Rows after `today` are ignored. */
export function buildHeatmap(rows: DayRecord[], today: string, days: number): HeatmapDay[] {
  const read = new Map<string, number>();
  for (const r of rows) if (r.date <= today) read.set(r.date, Math.max(read.get(r.date) ?? 0, r.storiesRead));
  return Array.from({ length: Math.max(0, days) }, (_, i): HeatmapDay => {
    const date = addDaysUtc(today, i - (days - 1));
    const storiesRead = read.get(date) ?? 0;
    return { date, storiesRead, level: heatmapLevel(storiesRead) };
  });
}
