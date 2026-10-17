// Pure geometry and summaries for the fast-forward simulation (only measured numbers are ever shown).
import type { SimulationResult } from '@/contracts/learning';
import type { TopicSlug } from '@/contracts/taxonomy';

export type SimKey = 'learning' | 'onboardingOnly' | 'popularity';
export interface SimPoint {
  day: number;
  value: number;
}
export interface SimSeries {
  key: SimKey;
  label: string;
  points: SimPoint[];
}

const SERIES: { key: SimKey; label: string }[] = [
  { key: 'learning', label: 'Learning' },
  { key: 'onboardingOnly', label: 'Onboarding only' },
  { key: 'popularity', label: 'Popularity' },
];

/** precision@20 per day for each arm, in a fixed order (colour follows the arm, never its rank). */
export function simSeries(r: SimulationResult): SimSeries[] {
  return SERIES.map(({ key, label }) => ({ key, label, points: r[key].map((d) => ({ day: d.day, value: d.precisionAt20 })) }));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Day 1…maxDay on x, value 0…1 on y (1 at the top), inside `box` minus `pad` on every side. */
export function linePath(points: SimPoint[], box: { w: number; h: number; pad: number }, maxDay: number): string {
  const spanX = box.w - 2 * box.pad;
  const spanY = box.h - 2 * box.pad;
  const days = Math.max(1, maxDay - 1);
  return points
    .map((p, i) => {
      const x = round1(box.pad + ((p.day - 1) / days) * spanX);
      const y = round1(box.pad + (1 - p.value) * spanY);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join('');
}

const LEAD_GAP = 0.05; // precision@20 points by which learning must beat onboarding-only to lead with the chart

/** Which visual leads: the chart when learning clearly wins on the last day, else the day-1 vs day-7 map. */
export function simPrimaryView(r: SimulationResult): 'chart' | 'map' {
  const learning = r.learning.at(-1)?.precisionAt20;
  const onboarding = r.onboardingOnly.at(-1)?.precisionAt20;
  if (learning === undefined || onboarding === undefined) return 'map';
  return Math.round((learning - onboarding) * 1000) >= Math.round(LEAD_GAP * 1000) ? 'chart' : 'map';
}

const topK = (weights: Record<TopicSlug, number>, k: number): TopicSlug[] =>
  Object.entries(weights)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([slug]) => slug);

/** The top-k topic mix of the first vs the last snapshot (SimulationResult carries no article lists). */
export function editionDiff(r: SimulationResult, k = 5): { entered: TopicSlug[]; left: TopicSlug[]; kept: TopicSlug[] } {
  const first = topK(r.snapshots[0]?.weights ?? {}, k);
  const last = topK(r.snapshots.at(-1)?.weights ?? {}, k);
  return {
    entered: last.filter((s) => !first.includes(s)),
    left: first.filter((s) => !last.includes(s)),
    kept: last.filter((s) => first.includes(s)),
  };
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One plain sentence: "Your paper now leads with Space and AI policy; Celebrity dropped out of the top 5." */
export function diffSentence(diff: { entered: TopicSlug[]; left: TopicSlug[]; kept?: TopicSlug[] }, names: Record<TopicSlug, string>, k = 5): string {
  const name = (s: TopicSlug) => names[s] ?? s;
  const entered = diff.entered.map(name);
  const left = diff.left.map(name);
  if (entered.length === 0 && left.length === 0) return `Your top ${k} topics held; their weights moved.`;
  const parts: string[] = [];
  if (entered.length > 0) parts.push(`Your paper now leads with ${list(entered)}`);
  if (left.length > 0) parts.push(`${list(left)} dropped out of the top ${k}`);
  return `${parts.join('; ')}.`;
}
