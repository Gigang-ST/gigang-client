create table public.competition_result (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member(id) on delete cascade,
  competition_id uuid not null references public.competition(id) on delete cascade,
  event_type text not null,
  finish_time_sec integer not null,
  finish_time_hhmmss text not null,
  finish_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, competition_id, event_type),
  check (event_type = upper(event_type)),
  check (finish_time_sec > 0)
);

create trigger competition_result_set_updated_at
before update on public.competition_result
for each row
execute function public.set_updated_at();
