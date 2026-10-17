// STUB (L0) — owner: L3. Replace freely; keep the signature.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub: parameters are kept for the §9.3 signature */
import type { Profile } from '@/contracts/profile';
import { FIXTURE_PROFILE } from '@/contracts/fixtures';

// null = not onboarded → pages redirect('/start'). Stub: always the fixture profile.
export async function getProfile(userId: string): Promise<Profile | null> {
  return FIXTURE_PROFILE;
}
