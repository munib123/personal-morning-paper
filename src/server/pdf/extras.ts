// What the paper prints beyond the edition: the reader's city and first name (profile) and what moved in
// their interests this week (learning view). Each falls back to a neutral value; there is never a streak.
import type { Edition } from '@/contracts/edition';
import { getLearningView } from '@/server/learn';
import { getProfile } from '@/server/profile';
import { APP_URL } from './fixture';
import type { PrintExtras } from './types';

const DEFAULT_CITY = 'Islamabad';

export async function loadPrintExtras(edition: Edition, now: Date): Promise<PrintExtras> {
  const [profile, learning] = await Promise.all([
    getProfile(edition.userId).catch(() => null),
    getLearningView(edition.userId, 7, now).catch(() => null),
  ]);
  return {
    city: profile?.city?.trim() || DEFAULT_CITY,
    displayName: profile?.displayName ?? null,
    movers: learning?.movers.slice(0, 5) ?? [],
    appUrl: APP_URL,
  };
}
