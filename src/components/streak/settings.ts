// Options and labels for the "Streak & settings" tab (Morrow Segmented options).
import type { SegmentedOption } from '@/components/morrow';

export const budgetOptions: SegmentedOption[] = [
  { value: '5', label: 'Quick', hint: '5 min' },
  { value: '15', label: 'Standard', hint: '15 min' },
  { value: '30', label: 'Deep', hint: '30 min' },
];

export const depthOptions: SegmentedOption[] = [
  { value: 'new', label: 'New to it' },
  { value: 'basics', label: 'Know the basics' },
  { value: 'expert', label: 'Expert' },
];

export const themeOptions: SegmentedOption[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'night', label: 'Night edition' },
];

/** The demo clock as "Sun 18 Oct, 07:00" in the reader's timezone, or "real time" when unset. */
export function clockLabel(iso: string | null, tz: string): string {
  if (!iso) return 'real time';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'real time';
  let zone = tz;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
  } catch {
    zone = 'Asia/Karachi';
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;
}
