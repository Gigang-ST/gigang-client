create extension if not exists pg_trgm;

create table if not exists public.competition (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  sport text,
  title text not null,
  start_date date not null,
  end_date date,
  location text,
  event_types text[],
  source_url text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists competition_title_trgm_idx
  on public.competition using gin (title gin_trgm_ops);

create index if not exists competition_start_date_idx
  on public.competition (start_date);
