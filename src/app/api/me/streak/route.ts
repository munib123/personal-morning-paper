// GET /api/me/streak (owner L7) → { streak: StreakView; heatmap: HeatmapDay[] } in the reader's
// timezone. 401 without a session (§9.7: route handlers use requireUser()).
import { requireUser } from '@/server/auth/session';
import { getProfile } from '@/server/profile';
import { getHeatmap, getStreak } from '@/server/streaks';
import { requestNow } from '@/server/time';

const DEFAULT_TZ = 'Asia/Karachi';
const HEATMAP_DAYS = 84; // 12 weeks

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
  const now = await requestNow();
  const tz = (await getProfile(userId))?.tz ?? DEFAULT_TZ;
  const [streak, heatmap] = await Promise.all([getStreak(userId, now, tz), getHeatmap(userId, HEATMAP_DAYS, now, tz)]);
  return Response.json({ streak, heatmap }, { headers: { 'cache-control': 'no-store' } });
}
