-- 20261017083000_l0_tighten_grants (L0 review, Important 2).
-- Readers get read-only access to their own rows. Every write path uses the secret key after
-- getClaims() (ARCHITECTURE §7), so `authenticated` needs no insert/update. Without this, any
-- anonymous visitor could e.g. set profiles.is_demo = true on their own row, forge streaks, or
-- re-point editions.pdf_path.

revoke insert, update on table
  profiles, user_interests, interest_snapshots, editions, edition_items, events, daily_activity, streaks
  from authenticated;

drop policy if exists own_insert on profiles;
drop policy if exists own_update on profiles;
drop policy if exists own_insert on user_interests;
drop policy if exists own_update on user_interests;
drop policy if exists own_insert on interest_snapshots;
drop policy if exists own_update on interest_snapshots;
drop policy if exists own_insert on editions;
drop policy if exists own_update on editions;
drop policy if exists own_insert on edition_items;
drop policy if exists own_update on edition_items;
drop policy if exists own_insert on events;
drop policy if exists own_update on events;
drop policy if exists own_insert on daily_activity;
drop policy if exists own_update on daily_activity;
drop policy if exists own_insert on streaks;
drop policy if exists own_update on streaks;
