// The three /me tabs (ARCHITECTURE §3), synced to ?tab=.
import type { LearningView, SimulationResult } from '@/contracts/learning';
import type { Profile } from '@/contracts/profile';
import type { HeatmapDay, StreakView } from '@/contracts/streak';
import type { TopicNode } from '@/contracts/taxonomy';

export type MeTab = 'learned' | 'interests' | 'streak';

/** Everything /me renders, loaded on the server (src/app/(reader)/me/_data.ts). */
export interface MeData {
  profile: Profile;
  streak: StreakView;
  heatmap: HeatmapDay[] | null; // 12 weeks of reading for the streak tab
  learning: LearningView | null; // null when getLearningView failed: the tab offers Try again
  taxonomy: TopicNode[];
  demoMode: boolean;
  nextMorning: string; // UTC ISO of the next edition day at 07:00 local
  clockIso: string | null; // the demo clock, or null for real time
  nowIso: string; // the request's now (requestNow), for 'time ago' labels
  simulation: SimulationResult | null; // the fixture simulation with ?fixtures=1, else null (the button fetches it)
  fixtures: boolean;
}

export const ME_TABS: { id: MeTab; label: string; short: string }[] = [
  { id: 'learned', label: 'Your paper learned', short: 'Learned' },
  { id: 'interests', label: 'Your interests', short: 'Interests' },
  { id: 'streak', label: 'Streak & settings', short: 'Streak & settings' },
];

const IDS = ME_TABS.map((t) => t.id);

export function parseMeTab(v: string | string[] | undefined): MeTab {
  const raw = Array.isArray(v) ? v[0] : v;
  return IDS.find((id) => id === raw) ?? 'learned';
}

/** Arrow keys move between tabs (wrapping); Home and End jump to the ends. Other keys: null. */
export function nextTab(current: MeTab, key: string): MeTab | null {
  const i = IDS.indexOf(current);
  switch (key) {
    case 'ArrowRight':
      return IDS[(i + 1) % IDS.length];
    case 'ArrowLeft':
      return IDS[(i - 1 + IDS.length) % IDS.length];
    case 'Home':
      return IDS[0];
    case 'End':
      return IDS[IDS.length - 1];
    default:
      return null;
  }
}
