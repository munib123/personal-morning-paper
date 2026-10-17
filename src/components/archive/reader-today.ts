// The reader's timezone and local date for server pages, deduplicated per request with React cache().
import { cache } from 'react';
import { getSessionUser } from '@/server/auth/session';
import { getProfile } from '@/server/profile';
import { localDate, requestNow } from '@/server/time';

const DEFAULT_TZ = 'Asia/Karachi';

export const readerTz = cache(async (): Promise<string> => {
  try {
    const user = await getSessionUser();
    if (!user) return DEFAULT_TZ;
    return (await getProfile(user.userId))?.tz ?? DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
});

/** Today's edition date for the signed-in reader (03:00 rollover, demo clock aware). */
export async function readerToday(): Promise<string> {
  const [now, tz] = await Promise.all([requestNow(), readerTz()]);
  return localDate(now, tz);
}
