// STUB (L0) — owner: L7. Replace freely; keep the signature.
import { FIXTURE_USER_ID } from '@/contracts/fixtures';
import { getProfile } from '@/server/profile';
import { getHeatmap, getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';

const DEFAULT_TZ = 'Asia/Karachi';
const HEATMAP_DAYS = 84; // 12 weeks

// GET → { streak: StreakView, heatmap: HeatmapDay[] }, in the reader's timezone. Stub: no auth, the fixture reader.
export async function GET(): Promise<Response> {
  const now = await requestNow();
  const tz = (await getProfile(FIXTURE_USER_ID))?.tz ?? DEFAULT_TZ;
  const [streak, heatmap] = await Promise.all([
    getStreak(FIXTURE_USER_ID, now, tz),
    getHeatmap(FIXTURE_USER_ID, HEATMAP_DAYS, now, tz),
  ]);
  return Response.json({ streak, heatmap });
}
