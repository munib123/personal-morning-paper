// Static checks on supabase/migrations/0001_init.sql (ARCHITECTURE §7 + plan L0 Task 6 Step 3).
// The SQL itself is applied by `npx supabase db push` (or the dashboard SQL editor).
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync('supabase/migrations/0001_init.sql', 'utf8');

/** Splits on `;` outside quotes and $$ bodies, drops `--` comments, lowercases and collapses whitespace. */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let dollar = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!quoted && !dollar && ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += ' ';
      continue;
    }
    if (!quoted && sql.startsWith('$$', i)) {
      dollar = !dollar;
      cur += '$$';
      i++;
      continue;
    }
    if (!dollar && ch === "'") quoted = !quoted;
    if (ch === ';' && !quoted && !dollar) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
}

const STMTS = statements(SQL);

const TABLES = [
  'topics', 'sources', 'clusters', 'articles', 'profiles', 'user_interests', 'interest_snapshots', 'editions',
  'edition_items', 'events', 'daily_activity', 'streaks', 'job_runs', 'llm_cache', 'llm_usage',
];
const CATALOGUE = ['topics', 'sources', 'clusters', 'articles', 'job_runs'];
const OWNER_TABLES = ['profiles', 'user_interests', 'interest_snapshots', 'editions', 'events', 'daily_activity', 'streaks'];
const PER_USER = [...OWNER_TABLES, 'edition_items'];
const SERVICE_ONLY = ['llm_cache', 'llm_usage'];

const createTable = (t: string) => {
  const s = STMTS.find((x) => x.startsWith(`create table ${t} (`));
  expect(s, `create table ${t}`).toBeDefined();
  return s!;
};

interface Policy { name: string; table: string; command: string; roles: string[]; text: string }
const POLICIES: Policy[] = STMTS.flatMap((s) => {
  const m = /^create policy (\S+) on (\S+) (?:as \w+ )?for (select|insert|update|delete|all)(?: to (.+?))?(?= using | with check |$)/.exec(s);
  if (!m) return [];
  const roles = m[4] ? m[4].split(',').map((r) => r.trim()) : ['public'];
  return [{ name: m[1], table: m[2].replace(/^public\./, ''), command: m[3], roles, text: s }];
});

interface Grant { table: string; role: string; privileges: string[] }
const GRANTS: Grant[] = STMTS.flatMap((s) => {
  const m = /^grant (.+?) on (?:table )?(.+?) to (.+)$/.exec(s);
  if (!m || /^(schema|function|all |sequence)/.test(m[2])) return [];
  const privileges = m[1].split(',').map((p) => p.trim());
  const tables = m[2].split(',').map((t) => t.trim().replace(/^public\./, ''));
  const roles = m[3].split(',').map((r) => r.trim());
  return tables.flatMap((table) => roles.map((role) => ({ table, role, privileges })));
});
const privilegesOf = (table: string, role: string) =>
  new Set(GRANTS.filter((g) => g.table === table && g.role === role).flatMap((g) => g.privileges));

describe('0001_init.sql: schema (§7)', () => {
  it('enables pgvector', () => {
    expect(STMTS).toContain('create extension if not exists vector');
  });

  it('creates exactly the 15 §7 tables', () => {
    const created = STMTS.flatMap((s) => /^create table (?:if not exists )?([a-z_][a-z0-9_.]*) \(/.exec(s)?.[1] ?? []);
    expect([...created].sort()).toEqual([...TABLES].sort());
  });

  it('enables row level security on every table it creates', () => {
    for (const t of TABLES) expect(STMTS, t).toContain(`alter table ${t} enable row level security`);
  });

  it('has articles.embed_model text and the 384-d vector columns', () => {
    expect(createTable('articles')).toMatch(/embed_model\s+text/);
    expect(createTable('articles')).toMatch(/embedding vector\(384\)/);
    expect(createTable('topics')).toMatch(/embedding vector\(384\)/);
    expect(createTable('clusters')).toMatch(/centroid vector\(384\)/);
    expect(createTable('profiles')).toMatch(/pos_emb vector\(384\).*neg_emb vector\(384\)/);
  });

  it('limits profiles.time_budget to 5/15/30 with default 15', () => {
    expect(createTable('profiles')).toContain('time_budget smallint not null default 15 check (time_budget in (5,15,30))');
  });

  it('has llm_usage keyed by (usage_day, model)', () => {
    const t = createTable('llm_usage');
    for (const col of ['usage_day date not null', 'model text not null', 'requests int not null default 0', 'rate_limited int not null default 0', 'tokens_in int not null default 0', 'tokens_out int not null default 0']) {
      expect(t).toContain(col);
    }
    expect(t).toContain('primary key (usage_day, model)');
  });
});

describe('0001_init.sql: increment_llm_usage', () => {
  const fn = STMTS.find((s) => /^create (or replace )?function increment_llm_usage\(/.test(s)) ?? '';

  it('has the §7 signature and returns int in plain SQL', () => {
    expect(fn).toMatch(
      /create (or replace )?function increment_llm_usage\(p_day date, p_model text, p_requests int, p_limited int, p_in int, p_out int\) returns int language sql/,
    );
  });

  it('upserts atomically and returns the new request total', () => {
    expect(fn).toContain('on conflict (usage_day, model) do update');
    expect(fn).toContain('returning requests');
  });

  it('runs with the caller rights, so RLS on llm_usage still applies', () => {
    expect(fn).not.toContain('security definer');
  });

  it('is executable by the service role only', () => {
    const sig = 'function increment_llm_usage(date, text, int, int, int, int)';
    const revoke = STMTS.find((s) => s.startsWith(`revoke execute on ${sig} from`));
    expect(revoke, 'revoke execute').toBeDefined();
    for (const role of ['public', 'anon', 'authenticated']) expect(revoke!.split(' from ')[1]).toContain(role);
    expect(STMTS).toContain(`grant execute on ${sig} to service_role`);
  });
});

describe('0001_init.sql: RLS policies', () => {
  it('lets anyone read the catalogue tables and job_runs', () => {
    for (const t of CATALOGUE) {
      const p = POLICIES.find((x) => x.table === t && x.name === 'read_all');
      expect(p, `${t} read_all`).toBeDefined();
      expect(p!.command).toBe('select');
      expect(p!.text).toContain('using (true)');
    }
  });

  it('gives owners select/insert/update on their own rows', () => {
    for (const t of OWNER_TABLES) {
      for (const command of ['select', 'insert', 'update']) {
        const p = POLICIES.find((x) => x.table === t && x.command === command);
        expect(p, `${t} ${command}`).toBeDefined();
        expect(p!.roles).toEqual(['authenticated']);
        expect(p!.text).toContain('(select auth.uid()) = user_id');
        if (command !== 'insert') expect(p!.text, `${t} ${command} using`).toContain(' using (');
        if (command !== 'select') expect(p!.text, `${t} ${command} with check`).toContain(' with check (');
      }
    }
  });

  it('scopes edition_items through the owning edition', () => {
    const owner = 'exists (select 1 from editions e where e.id = edition_items.edition_id and e.user_id = (select auth.uid()))';
    for (const command of ['select', 'insert', 'update']) {
      const p = POLICIES.find((x) => x.table === 'edition_items' && x.command === command);
      expect(p, `edition_items ${command}`).toBeDefined();
      expect(p!.roles).toEqual(['authenticated']);
      expect(p!.text).toContain(owner);
    }
  });

  it('has a policy on every per-user table and none on llm_cache / llm_usage', () => {
    for (const t of PER_USER) expect(POLICIES.some((p) => p.table === t), t).toBe(true);
    for (const t of SERVICE_ONLY) expect(POLICIES.filter((p) => p.table === t), t).toEqual([]);
  });
});

describe('0001_init.sql: grants', () => {
  it('grants select on the catalogue to anon and authenticated', () => {
    for (const t of CATALOGUE) for (const role of ['anon', 'authenticated']) expect(privilegesOf(t, role).has('select'), `${t} ${role}`).toBe(true);
  });

  it('grants select, insert, update on the per-user tables to authenticated only', () => {
    for (const t of PER_USER) {
      expect([...privilegesOf(t, 'authenticated')].sort(), t).toEqual(['insert', 'select', 'update']);
      expect(privilegesOf(t, 'anon').size, `${t} anon`).toBe(0);
    }
  });

  it('keeps llm_cache and llm_usage away from anon and authenticated', () => {
    for (const t of SERVICE_ONLY) for (const role of ['anon', 'authenticated']) expect(privilegesOf(t, role).size, `${t} ${role}`).toBe(0);
  });

  it('gives the service role every table', () => {
    for (const t of TABLES) expect(privilegesOf(t, 'service_role').has('all'), t).toBe(true);
  });
});

describe('0001_init.sql: storage', () => {
  it("creates the private 'papers' bucket", () => {
    const bucket = /^insert into storage\.buckets \(id, ?name, ?public\) values \('papers', ?'papers', ?false\) on conflict \(id\) do nothing$/;
    expect(STMTS.some((s) => bucket.test(s))).toBe(true);
  });

  it('lets a signed-in reader read only the PDFs under their own user id folder', () => {
    const p = POLICIES.find((x) => x.table === 'storage.objects' && x.name === 'papers_owner_read');
    expect(p).toBeDefined();
    expect(p!.command).toBe('select');
    expect(p!.roles).toEqual(['authenticated']);
    expect(p!.text).toContain("bucket_id = 'papers'");
    expect(p!.text).toContain('(storage.foldername(name))[1] = (select auth.uid())::text');
  });
});
