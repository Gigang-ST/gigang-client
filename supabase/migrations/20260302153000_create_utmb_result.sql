create table public.utmb_result (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member(id) on delete cascade,
  competition_id uuid references public.competition(id) on delete set null,
  race_name text not null,
  race_date date not null,
  distance_label text,
  points integer not null,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (points >= 0),
  check (distance_label is null or distance_label = upper(distance_label))
);

create trigger utmb_result_set_updated_at
before update on public.utmb_result
for each row
execute function public.set_updated_at();
