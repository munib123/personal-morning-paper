// The refold (ARCHITECTURE §10.4 "Decay"): rebuild every interest from its prior by replaying recent
// events, each weighted 0.5^(ageDays/14). Interests decay toward the prior, never toward zero. PURE.
import type { Candidate, InterestState, RankParams, UserModel } from '@/contracts/engine';
import type { SignalEvent } from '@/contracts/signals';
import { ancestorsOf, type TopicSlug } from '@/contracts/taxonomy';
import { addReward, rewardOf } from './signal';

export interface LoggedEvent {
  ev: SignalEvent;
  item: Candidate | null;
  occurredAt: string;
}

const DAY_MS = 86_400_000;
const READ_TYPES = new Set<SignalEvent['type']>(['open', 'read_original', 'qr_scan', 'save', 'share', 'more']);

/** Median normalized dwell > 1.2 → the reader likes depth (+1); < 0.5 → they skim (−1). */
export function depthPrefFrom(normDwells: number[]): -1 | 0 | 1 {
  if (normDwells.length === 0) return 0;
  const s = [...normDwells].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return median > 1.2 ? 1 : median < 0.5 ? -1 : 0;
}

export function refold(model: UserModel, events: LoggedEvent[], now: Date, params: RankParams): UserModel {
  const interests: Record<TopicSlug, InterestState> = {};
  for (const [slug, s] of Object.entries(model.interests)) interests[slug] = { ...s, alpha: s.priorAlpha, beta: s.priorBeta };
  const normDwells: number[] = [];
  for (const { ev, item, occurredAt } of events) {
    if (!item) continue;
    const ageDays = Math.max(0, (now.getTime() - Date.parse(occurredAt)) / DAY_MS);
    const w = Math.pow(0.5, ageDays / params.decayHalfLifeDays);
    addReward(interests, item, rewardOf(ev, item, params) * w, params);
    if (ev.type === 'dwell' && typeof ev.value === 'number') {
      const expected = Math.max(params.minExpectedDwellMs, (item.wordCount / params.wpm) * 60_000);
      normDwells.push(ev.value / expected);
    }
  }
  return { ...model, interests, depthPref: depthPrefFrom(normDwells) };
}

/**
 * Distinct articles read (open, read_original, qr_scan, save, share, more) in the last `days`, counted once
 * for the article's top label and once for every ancestor of it. Feeds "You read {n} stories on {name} this week".
 */
export function topicReadCounts(events: LoggedEvent[], now: Date, days = 7): Record<TopicSlug, number> {
  const since = now.getTime() - days * DAY_MS;
  const seen = new Set<string>();
  const out: Record<TopicSlug, number> = {};
  for (const { ev, item, occurredAt } of events) {
    if (!item || !READ_TYPES.has(ev.type) || item.labels.length === 0) continue;
    const t = Date.parse(occurredAt);
    if (t < since || t > now.getTime()) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    let top = item.labels[0];
    for (const l of item.labels) if (l.conf > top.conf) top = l;
    for (const slug of [top.slug, ...ancestorsOf(top.slug)]) out[slug] = (out[slug] ?? 0) + 1;
  }
  return out;
}
