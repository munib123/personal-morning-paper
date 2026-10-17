import { FIXTURE_LEARNING, FIXTURE_PROFILE } from '@/contracts/fixtures';
import type { PrintExtras } from './types';

/** Base URL baked into every QR code and headline link (`{APP_URL}/r/{id}?src=print&e={editionId}`). */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Print extras for the fixture edition: the sample PDF, the print route's ?fixture=1 and the tests. */
export function fixtureExtras(): PrintExtras {
  return {
    city: FIXTURE_PROFILE.city,
    displayName: FIXTURE_PROFILE.displayName,
    movers: FIXTURE_LEARNING.movers.slice(0, 5),
    appUrl: APP_URL,
  };
}
