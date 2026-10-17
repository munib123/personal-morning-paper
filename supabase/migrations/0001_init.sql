-- 0001_init: Subah schema. Owner: L0.
-- Tables, indexes and increment_llm_usage are docs/ARCHITECTURE.md §7 verbatim; the RLS block is
-- extended per docs/plans/L0-foundation.md Task 6 Step 3, followed by grants and the 'papers' bucket.
-- Never edit this file once applied: later changes go in new files `<timestamp>_<lane>_<what>.sql`.

create extension if not exists vector;

-- ── Catalogue (public read) ─────────────────────────────────────────────
create table topics (
  slug        text primary key,                 -- dot-path 'technical.cs.web-dev'
  parent_slug text references topics(slug),
  level       smallint not null check (level between 1 and 3),
  name        text not null,
  description text not null,                    -- embedded for zero-shot labels
  emoji       text,
  synonyms    text[] not null default '{}',
  embedding   vector(384)
);

create table sources (
  id          text primary key,                 -- slug, e.g. 'dawn-pakistan'
  name        text not null,
  url         text not null unique,             -- feed or API endpoint
  kind        text not null check (kind in ('rss','hn','devto','arxiv')),
  homepage    text,
  region      text not null default 'global' check (region in ('pk','global')),
  topics      text[] not null default '{}',     -- prior slugs from feeds.json
  quality     real not null default 0.5,
  active      boolean not null default true,
  last_fetched_at timestamptz, last_status text, fail_count int not null default 0
);

create table clusters (
  id           uuid primary key default gen_random_uuid(),
  centroid     vector(384),
  headline     text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  article_count int not null default 1,
  source_count  int not null default 1,
  importance    real not null default 0,        -- §10.2
  perspectives  jsonb                            -- wave 2: {summary, angles[], disagreements[]}
);

create table articles (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null references sources(id),
  url           text not null,
  url_hash      text not null unique,            -- sha256(canonical url)
  title         text not null,
  lede          text,                            -- feed description, plain text
  content_text  text,                            -- summarizer input only; NEVER displayed
  image_url     text,
  author        text,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  word_count    int not null default 0,
  lang          text not null default 'en',
  embedding     vector(384),
  labels        jsonb not null default '[]',     -- [{slug, conf}] 1-3 items, most specific first
  cluster_id    uuid references clusters(id),
  status        text not null default 'raw'
                check (status in ('raw','embedded','enriched','fallback','unusable')),
  headline      text,
  summary_brief text, summary_std text, summary_deep text,  -- ~25 / ~60 / ~120 words
  why_it_matters text,
  key_fact      text,
  entities      jsonb not null default '[]',     -- string[]
  recall        jsonb,                           -- stored camelCase: {question, options[3], answerIndex, explanation} (L2 converts Gemini's answer_index)
  embed_model   text,                            -- e.g. 'Supabase/gte-small'; detects mixed vector spaces
  ur            jsonb,                           -- wave 2: {headline, summary_std}
  enrich_provider text,                          -- 'gemini:<model>' | 'extractive'
  enriched_at   timestamptz
);
create index articles_published_idx on articles (published_at desc);
create index articles_status_idx on articles (status);
create index articles_cluster_idx on articles (cluster_id);

-- ── People ──────────────────────────────────────────────────────────────
create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  paper_name   text not null default 'The Morrow',
  tz           text not null default 'Asia/Karachi',
  city         text not null default 'Islamabad',
  time_budget  smallint not null default 15 check (time_budget in (5,15,30)),
  depth        text not null default 'basics' check (depth in ('new','basics','expert')),
  lang         text not null default 'en' check (lang in ('en','ur')),
  delivery_hour smallint not null default 7,
  pos_emb      vector(384),
  neg_emb      vector(384),
  n_engaged    int not null default 0,
  depth_pref   smallint not null default 0 check (depth_pref between -1 and 1),
  is_demo      boolean not null default false,
  onboarded_at timestamptz,
  created_at   timestamptz not null default now()
);

create table user_interests (
  user_id     uuid not null references profiles(user_id) on delete cascade,
  slug        text not null references topics(slug),
  alpha       real not null,
  beta        real not null,
  prior_alpha real not null,
  prior_beta  real not null,
  picked      boolean not null default false,
  muted       boolean not null default false,
  pinned      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, slug)
);

create table interest_snapshots (
  user_id   uuid not null references profiles(user_id) on delete cascade,
  snap_date date not null,
  weights   jsonb not null,                      -- { slug: theta }
  primary key (user_id, snap_date)
);

-- ── Editions ────────────────────────────────────────────────────────────
create table editions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(user_id) on delete cascade,
  edition_date  date not null,                   -- reader-local date, 03:00 rollover
  number        int not null,
  paper_name    text not null,
  editor_note   text not null,
  editor_note_source text not null default 'template' check (editor_note_source in ('gemini','template')),
  section_order text[] not null,
  lead_article_id uuid not null references articles(id),
  recall        jsonb not null default '[]',     -- RecallQuestion[]
  presentation  jsonb not null,                  -- Presentation
  receipt       jsonb not null,                  -- EditionReceipt
  algo_version  text not null,
  params        jsonb not null,
  pdf_path      text,
  created_at    timestamptz not null default now(),
  unique (user_id, edition_date)
);

create table edition_items (
  edition_id   uuid not null references editions(id) on delete cascade,
  rank         smallint not null,                -- 1..20 edition, 21..28 reserve
  article_id   uuid not null references articles(id),
  slot         text not null check (slot in ('lead','top','core','bigstory','explore','serendipity','reserve')),
  section_slug text not null references topics(slug),
  tier         text not null check (tier in ('brief','std','deep')),
  score        real not null,
  breakdown    jsonb not null,                   -- ScoreBreakdown
  reasons      jsonb not null,                   -- Reason[]
  primary key (edition_id, rank)
);

-- ── Signals ─────────────────────────────────────────────────────────────
create table events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(user_id) on delete cascade,
  edition_id  uuid references editions(id) on delete set null,
  article_id  uuid references articles(id) on delete set null,
  type        text not null,                     -- SignalType (§9.1), validated in app
  value       real,                              -- dwell ms | 1/0 recall | slider value
  meta        jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  local_date  date not null
);
create index events_user_time_idx on events (user_id, occurred_at desc);

-- ── Streaks ─────────────────────────────────────────────────────────────
create table daily_activity (                    -- source of truth for streaks
  user_id          uuid not null references profiles(user_id) on delete cascade,
  local_date       date not null,
  qualifying_reads int not null default 0,
  stories_read     int not null default 0,
  recall_correct   int not null default 0,
  recall_total     int not null default 0,
  edition_complete boolean not null default false,
  status           text not null default 'read' check (status in ('read','frozen','repaired')),
  primary key (user_id, local_date)
);

create table streaks (                           -- cache, rebuildable from daily_activity
  user_id           uuid primary key references profiles(user_id) on delete cascade,
  current           int not null default 0,
  longest           int not null default 0,
  total_days        int not null default 0,
  last_streak_date  date,
  freezes_available smallint not null default 1 check (freezes_available between 0 and 2),
  freeze_progress   smallint not null default 0,
  last_repair_at    timestamptz,
  updated_at        timestamptz not null default now()
);

-- ── Ops ─────────────────────────────────────────────────────────────────
create table job_runs (
  id bigint generated always as identity primary key,
  job text not null, started_at timestamptz not null default now(),
  finished_at timestamptz, status text not null default 'running', stats jsonb not null default '{}'
);
create table llm_cache (
  key text primary key,                          -- sha256(step|model|input)
  step text not null, provider text not null, output jsonb not null,
  created_at timestamptz not null default now()
);
create table llm_usage (                         -- per-model daily budget (Gemini limits are per project+model; RPD resets 00:00 PT = 12:00 PKT)
  usage_day  date not null,                      -- Pacific date
  model      text not null,
  requests   int not null default 0,
  rate_limited int not null default 0,
  tokens_in  int not null default 0,
  tokens_out int not null default 0,
  primary key (usage_day, model)
);
-- atomic budget increment (callLLM uses it; avoids read-modify-write races)
create function increment_llm_usage(p_day date, p_model text, p_requests int, p_limited int, p_in int, p_out int)
returns int language sql as $$
  insert into llm_usage as u (usage_day, model, requests, rate_limited, tokens_in, tokens_out)
  values (p_day, p_model, p_requests, p_limited, p_in, p_out)
  on conflict (usage_day, model) do update
    set requests = u.requests + excluded.requests, rate_limited = u.rate_limited + excluded.rate_limited,
        tokens_in = u.tokens_in + excluded.tokens_in, tokens_out = u.tokens_out + excluded.tokens_out
  returning requests;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Jobs and server write paths use the secret key (service_role bypasses RLS). These policies
-- cover the publishable key: anon (logged out) and authenticated (incl. anonymous sign-ins).
alter table topics enable row level security;    create policy read_all on topics   for select using (true);
alter table sources enable row level security;   create policy read_all on sources  for select using (true);
alter table clusters enable row level security;  create policy read_all on clusters for select using (true);
alter table articles enable row level security;  create policy read_all on articles for select using (true);
-- job_runs: public select (newsroom status)
alter table job_runs enable row level security;  create policy read_all on job_runs for select using (true);
-- llm_cache, llm_usage: RLS on and no policies (service role only)
alter table llm_cache enable row level security;
alter table llm_usage enable row level security;

-- per-user tables: owner can select/insert/update own rows
-- (profiles, user_interests, interest_snapshots, editions, edition_items via edition owner, events, daily_activity, streaks)
alter table profiles enable row level security;
create policy own_select on profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table user_interests enable row level security;
create policy own_select on user_interests for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on user_interests for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on user_interests for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table interest_snapshots enable row level security;
create policy own_select on interest_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on interest_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on interest_snapshots for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table editions enable row level security;
create policy own_select on editions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on editions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on editions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table edition_items enable row level security;
create policy own_select on edition_items for select to authenticated
  using (exists (select 1 from editions e where e.id = edition_items.edition_id and e.user_id = (select auth.uid())));
create policy own_insert on edition_items for insert to authenticated
  with check (exists (select 1 from editions e where e.id = edition_items.edition_id and e.user_id = (select auth.uid())));
create policy own_update on edition_items for update to authenticated
  using (exists (select 1 from editions e where e.id = edition_items.edition_id and e.user_id = (select auth.uid())))
  with check (exists (select 1 from editions e where e.id = edition_items.edition_id and e.user_id = (select auth.uid())));

alter table events enable row level security;
create policy own_select on events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on events for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table daily_activity enable row level security;
create policy own_select on daily_activity for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on daily_activity for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on daily_activity for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table streaks enable row level security;
create policy own_select on streaks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy own_insert on streaks for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy own_update on streaks for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── Grants ──────────────────────────────────────────────────────────────
-- Explicit, so access never depends on the project's default privileges: start from nothing for
-- the API roles, then grant exactly what the policies above allow.
grant usage on schema public to anon, authenticated, service_role;

revoke all on table
  topics, sources, clusters, articles, profiles, user_interests, interest_snapshots, editions,
  edition_items, events, daily_activity, streaks, job_runs, llm_cache, llm_usage
  from anon, authenticated;

grant select on table topics, sources, clusters, articles, job_runs to anon, authenticated;

grant select, insert, update on table
  profiles, user_interests, interest_snapshots, editions, edition_items, events, daily_activity, streaks
  to authenticated;

grant all on table
  topics, sources, clusters, articles, profiles, user_interests, interest_snapshots, editions,
  edition_items, events, daily_activity, streaks, job_runs, llm_cache, llm_usage
  to service_role;
grant usage, select on all sequences in schema public to service_role;

-- increment_llm_usage is security invoker; only the service role (callLLM's admin client) runs it.
revoke execute on function increment_llm_usage(date, text, int, int, int, int) from public, anon, authenticated;
grant execute on function increment_llm_usage(date, text, int, int, int, int) to service_role;

-- ── Storage ─────────────────────────────────────────────────────────────
-- Storage: private bucket 'papers'; PDFs at papers/{user_id}/{edition_date}-{hash}.pdf, served by signed URL.
-- Object keys are '{userId}/{date}-{hash}.pdf' (§9.7); editions.pdf_path stores the key without the bucket.
insert into storage.buckets (id, name, public) values ('papers', 'papers', false) on conflict (id) do nothing;

-- A signed-in reader may read only the objects under their own user id folder (uploads use the secret key).
create policy papers_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
