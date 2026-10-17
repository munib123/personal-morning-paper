// src/server/profile (L3): the reader's Profile (§9.1) from the profiles table.
import type { Profile } from '@/contracts/profile';
import { FIXTURE_PROFILE, FIXTURE_USER_ID } from '@/contracts/fixtures';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { asDepth, asLang, asTimeBudget } from '@/server/learn/store';
import { isDemoFallback, snapshotGetProfile } from '@/server/demo';

export const PROFILE_COLUMNS = 'user_id, display_name, paper_name, tz, city, time_budget, depth, lang, delivery_hour, is_demo, onboarded_at';

export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  paper_name: string;
  tz: string;
  city: string;
  time_budget: number;
  depth: string;
  lang: string;
  delivery_hour: number;
  is_demo: boolean;
  onboarded_at: string | null;
}

const iso = (t: string | null): string | null => (t ? new Date(t).toISOString() : null);

export function rowToProfile(r: ProfileRow): Profile {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    paperName: r.paper_name,
    tz: r.tz,
    city: r.city,
    presentation: { timeBudget: asTimeBudget(r.time_budget), depth: asDepth(r.depth), lang: asLang(r.lang) },
    deliveryHour: r.delivery_hour,
    isDemo: r.is_demo,
    onboardedAt: iso(r.onboarded_at),
  };
}

/**
 * Fixture mode: other lanes' L0 stub pages and routes still call the L3 functions with FIXTURE_USER_ID
 * (a fixed UUID no real account has). For that id L3 keeps answering with the L0 fixtures, so their
 * stubs keep rendering until they move to the session user. Real readers never take this path.
 */
export const isFixtureUser = (userId: string): boolean => userId === FIXTURE_USER_ID;

export interface ProfilePatch {
  paperName?: string;
  presentation?: Partial<Profile['presentation']>;
  city?: string;
}

/** PATCH /api/me/profile: the next build uses it ("Rebuild" shows the change at once). */
export async function updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  if (isFixtureUser(userId)) {
    return { ...FIXTURE_PROFILE, ...(patch.paperName ? { paperName: patch.paperName } : {}), ...(patch.city ? { city: patch.city } : {}), presentation: { ...FIXTURE_PROFILE.presentation, ...patch.presentation } };
  }
  const row: { paper_name?: string; city?: string; time_budget?: number; depth?: string; lang?: string } = {};
  if (patch.paperName !== undefined) row.paper_name = patch.paperName;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.presentation?.timeBudget !== undefined) row.time_budget = patch.presentation.timeBudget;
  if (patch.presentation?.depth !== undefined) row.depth = patch.presentation.depth;
  if (patch.presentation?.lang !== undefined) row.lang = patch.presentation.lang;
  if (Object.keys(row).length > 0) {
    const { error } = await createSupabaseAdminClient().from('profiles').update(row).eq('user_id', userId);
    if (error) throw new Error(`updateProfile: ${error.message}`);
  }
  const profile = await getProfile(userId);
  if (!profile) throw Response.json({ error: 'not_onboarded' }, { status: 409 });
  return profile;
}

/** null = not onboarded (no row, or onboarded_at is null) → pages redirect('/start'). */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (isDemoFallback()) return snapshotGetProfile(userId);
  if (isFixtureUser(userId)) return FIXTURE_PROFILE;
  const { data, error } = await createSupabaseAdminClient().from('profiles').select(PROFILE_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  const row = data as ProfileRow | null;
  if (!row || !row.onboarded_at) return null;
  return rowToProfile(row);
}
