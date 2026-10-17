// Static checks on the grant-tightening migration (L0 review, Important 2).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PER_USER = ['profiles', 'user_interests', 'interest_snapshots', 'editions', 'edition_items', 'events', 'daily_activity', 'streaks'];

function migration0002(): string {
  const dir = 'supabase/migrations';
  const file = existsSync(dir) ? readdirSync(dir).find((f) => /_l0_tighten_grants\.sql$/.test(f)) : undefined;
  if (!file) throw new Error('missing supabase/migrations/<timestamp>_l0_tighten_grants.sql');
  return readFileSync(`${dir}/${file}`, 'utf8').toLowerCase();
}

describe('0002 tighten grants', () => {
  it('revokes insert and update on every per-user table from authenticated (all writes go through the secret key, §7)', () => {
    const sql = migration0002();
    const revoke = sql.match(/revoke\s+insert\s*,\s*update\s+on\s+table([\s\S]*?)from\s+authenticated/);
    expect(revoke, 'revoke insert, update … from authenticated').not.toBeNull();
    for (const t of PER_USER) expect(revoke![1]).toContain(t);
  });

  it('drops the owner insert/update policies so readers keep read-only access', () => {
    const sql = migration0002();
    for (const t of PER_USER) {
      expect(sql).toContain(`drop policy if exists own_insert on ${t}`);
      expect(sql).toContain(`drop policy if exists own_update on ${t}`);
    }
  });

  it('keeps owner select (readers still see their own rows)', () => {
    expect(migration0002()).not.toMatch(/revoke\s+select/);
  });
});
