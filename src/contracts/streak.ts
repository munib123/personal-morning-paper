// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.

export type StreakState = 'new' | 'pending' | 'done_today' | 'at_risk' | 'frozen' | 'repairable' | 'broken';
export type DayStatus = 'read' | 'frozen' | 'repaired' | 'missed' | 'today' | 'future';
export interface StreakView { state: StreakState; current: number; longest: number; totalDays: number; freezesAvailable: number; todayQualified: boolean;
  todayStoriesRead: number; editionComplete: boolean; milestone: number | null; last7: { date: string; status: DayStatus }[]; }
export interface HeatmapDay { date: string; storiesRead: number; level: 0 | 1 | 2 | 3 | 4; }
